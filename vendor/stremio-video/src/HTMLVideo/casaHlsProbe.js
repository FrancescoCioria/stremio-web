// Casa: osservabilita' PERMANENTE del player (hls.js + <video>).
//
// NON e' temporanea e non va rimossa: e' la rete che impedisce di tornare ciechi.
// Il log che avevamo prima (`player-state`) c'era gia' — e ci ha resi ciechi lo
// stesso, perche' registrava `buffering: true` senza dire MAI la cosa che conta:
// **se e per quanto l'immagine si e' davvero fermata**. Il 2026-07-13 questo ha
// prodotto due diagnosi sbagliate di fila: eventi di buffering da ~0.8s che
// l'utente NON vedeva (transizioni interne del player, nessun frame perso) letti
// come freeze; e uno stall ogni 20-30s attribuito ai micro-gap dell'AAC quando i
// buchi erano nel VIDEO e l'audio era 300s avanti e pulito.
//
// Regola imparata: un log che non separa "si e' visto" da "non si e' visto" non e'
// osservabilita', e' rumore che sembra evidenza. Percio' l'evento centrale qui
// (`hls-stall`) esce **alla RIPRESA**, non all'inizio, e porta `durationMs` +
// `jumpMs` — cioe' la risposta diretta a "l'utente l'ha visto?".
//
// Cosa emette, in ~/.local/state/stremio-player-debug.log:
//
//   ev:"hls-stall"      un freeze CONCLUSO. durationMs = quanto e' rimasta ferma
//                       l'immagine (>~250ms = percettibile); jumpMs = di quanto e'
//                       saltato currentTime alla ripresa (la firma del salto sopra
//                       un buco); `hole` = il buco in cui e' caduta la testina;
//                       `tracks` = buffer avanti PER SourceBuffer (video/audio
//                       separati: `videoElement.buffered` e' la loro intersezione e
//                       nasconderebbe il caso "audio pieno, video bucato", che e'
//                       esattamente quello che ci e' successo).
//   ev:"hls-stall-open" il freeze e' in corso da oltre STALL_OPEN_MS e non e'
//                       ancora finito. Senza questo, un player appeso per sempre
//                       non lascerebbe NESSUNA riga (l'evento di chiusura non
//                       arriverebbe mai) — cioe' il bug piu' grave sarebbe l'unico
//                       invisibile. Vedi lo stallo "appeso al primo frammento".
//   ev:"hls-error"      bufferStalledError / bufferSeekOverHole / bufferNudgeOnStall
//                       & co: il gap-controller di hls.js colto sul fatto.
//   ev:"hls-buffer"     battito (30s) col buffer avanti per traccia e il numero di
//                       micro-buchi: distingue "buffer sempre rasoterra" da "buffer
//                       pieno e bucato". Senza ranges completi, per non gonfiare il log.

var BACKEND_PORT = 8765;
var HEARTBEAT_MS = 30000;
var STALL_OPEN_MS = 8000;    // oltre questo, un freeze ancora aperto si annuncia da solo
var MAX_HOLE_S = 2;          // sopra: non e' un micro-buco, e' buffer mancante

// Beacon duplicato di proposito (non importa `stremio/common/casaBackend`): questo
// e' un package a se' (workspace `vendor/stremio-video`) e non deve dipendere dagli
// alias webpack dell'app che lo consuma. La regola condivisa, quella si': l'host si
// deriva DALLA PAGINA, mai 127.0.0.1 — da remoto (Mac via Tailscale) il loopback e'
// il Mac, e i log sparirebbero in silenzio.
function beacon(payload) {
    try {
        if (typeof window === 'undefined' || !window.location || !navigator.sendBeacon) return;
        var url = 'http://' + window.location.hostname + ':' + BACKEND_PORT + '/debug/player-event';
        navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: 'text/plain' }));
    } catch (_e) { /* best-effort: la sonda non deve MAI rompere il player */ }
}

// Secondi gia' bufferizzati DAVANTI a `t`; se `t` cade in un buco, il buco.
function forwardBuffer(ranges, t) {
    if (!ranges || typeof ranges.length !== 'number') return null;
    for (var i = 0; i < ranges.length; i++) {
        var start = ranges.start(i);
        var end = ranges.end(i);
        if (t >= start - 0.001 && t < end) return { ahead: +(end - t).toFixed(3), hole: null };
        if (t < start) {
            return { ahead: 0, hole: { from: +t.toFixed(3), to: +start.toFixed(3), size: +(start - t).toFixed(3) } };
        }
    }
    return { ahead: 0, hole: null };
}

function rangesToArray(ranges) {
    var out = [];
    if (!ranges || typeof ranges.length !== 'number') return out;
    for (var i = 0; i < ranges.length; i++) out.push([+ranges.start(i).toFixed(2), +ranges.end(i).toFixed(2)]);
    return out;
}

function countHoles(ranges) {
    var r = rangesToArray(ranges), n = 0;
    for (var i = 0; i < r.length - 1; i++) {
        var gap = r[i + 1][0] - r[i][1];
        if (gap > 0.001 && gap < MAX_HOLE_S) n++;
    }
    return n;
}

function casaHlsProbe(hls, videoElement, Hls) {
    // Ultimi TimeRanges per SourceBuffer. Le chiavi NON sono fisse: `video`+`audio`
    // quando l'audio e' una rendition separata (il nostro caso: server.js lancia due
    // ffmpeg, uno `-c:v copy` e uno `-c:a aac`), oppure un solo `audiovideo` se il
    // flusso e' muxato. Generiche di proposito -> il log dice anche in quale
    // modalita' siamo, che decide se l'asimmetria audio/video sia perfino possibile.
    var trackRanges = {};
    var stall = null;      // freeze in corso
    var openTimer = null;
    var heartbeat = null;

    function buffers(t) {
        return {
            media: forwardBuffer(videoElement.buffered, t),
            tracks: Object.keys(trackRanges).reduce(function(acc, k) {
                acc[k] = forwardBuffer(trackRanges[k], t);
                return acc;
            }, {})
        };
    }

    var onWaiting = function() {
        if (stall) return;
        var t = videoElement.currentTime;
        var b = buffers(t);
        stall = {
            wall: Date.now(),
            time: t,
            media: b.media,
            tracks: b.tracks,
            ranges: rangesToArray(videoElement.buffered)
        };
        // Un freeze che non finisce non emetterebbe mai l'evento di chiusura:
        // annuncialo mentre e' ancora aperto, o il bug peggiore resta l'unico muto.
        openTimer = setTimeout(function() {
            if (!stall) return;
            beacon({
                ev: 'hls-stall-open',
                openMs: Date.now() - stall.wall,
                time: +stall.time.toFixed(3),
                readyState: videoElement.readyState,
                media: stall.media,
                tracks: stall.tracks,
                ranges: stall.ranges
            });
        }, STALL_OPEN_MS);
    };

    // La ripresa: qui sappiamo QUANTO e' durato e se currentTime e' saltato.
    var onResume = function() {
        if (!stall) return;
        var durationMs = Date.now() - stall.wall;
        var jumpMs = Math.round((videoElement.currentTime - stall.time) * 1000);
        clearTimeout(openTimer);
        openTimer = null;
        var s = stall;
        stall = null;
        beacon({
            ev: 'hls-stall',
            durationMs: durationMs,
            // >~250ms = l'utente lo vede. Sotto, e' un evento interno del player e
            // NON va contato come hiccup (l'errore del 2026-07-13).
            visible: durationMs >= 250,
            jumpMs: jumpMs,                    // != 0 => e' saltato sopra un buco
            time: +s.time.toFixed(3),
            hole: s.media ? s.media.hole : null,
            media: s.media,
            tracks: s.tracks,
            ranges: s.ranges
        });
    };
    videoElement.addEventListener('waiting', onWaiting);
    videoElement.addEventListener('playing', onResume);
    videoElement.addEventListener('seeked', onResume);   // il salto sopra il buco passa da qui

    var onBufferAppended = function(_e, data) {
        if (!data || !data.timeRanges) return;
        Object.keys(data.timeRanges).forEach(function(name) {
            if (data.timeRanges[name]) trackRanges[name] = data.timeRanges[name];
        });
    };
    hls.on(Hls.Events.BUFFER_APPENDED, onBufferAppended);

    var onError = function(_e, data) {
        if (!data) return;
        var t = videoElement.currentTime;
        var b = buffers(t);
        beacon({
            ev: 'hls-error',
            details: data.details,           // bufferSeekOverHole / bufferStalledError / ...
            fatal: !!data.fatal,
            errType: data.type,
            time: +t.toFixed(3),
            media: b.media,
            tracks: b.tracks
        });
    };
    hls.on(Hls.Events.ERROR, onError);

    heartbeat = setInterval(function() {
        if (videoElement.paused || videoElement.ended) return;
        var t = videoElement.currentTime;
        var b = buffers(t);
        beacon({
            ev: 'hls-buffer',
            time: +t.toFixed(3),
            readyState: videoElement.readyState,
            media: b.media,
            tracks: b.tracks,
            holes: countHoles(videoElement.buffered)   // buffer pieno-e-bucato vs vuoto
        });
    }, HEARTBEAT_MS);

    return function destroy() {
        clearInterval(heartbeat);
        clearTimeout(openTimer);
        videoElement.removeEventListener('waiting', onWaiting);
        videoElement.removeEventListener('playing', onResume);
        videoElement.removeEventListener('seeked', onResume);
        try {
            hls.off(Hls.Events.BUFFER_APPENDED, onBufferAppended);
            hls.off(Hls.Events.ERROR, onError);
        } catch (_e) { /* hls gia' distrutto */ }
    };
}

module.exports = casaHlsProbe;
