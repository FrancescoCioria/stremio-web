// Casa: sonda DIAGNOSTICA (temporanea) su hls.js + <video>.
//
// PERCHE' ESISTE (2026-07-13). Sintomo: il film si ferma ~1s ogni 20-30s, con
// `buffering:true` e `paused:false` (quindi non e' una pausa, e' un underrun).
// Misurato sul Beelink DURANTE uno stall, dal basso verso l'alto:
//   - TorrServer ha in cache tutti i pieces dalla posizione corrente alla fine;
//   - ffmpeg copia il video (`-c:v copy`, solo l'audio va in AAC) al 12% di CPU
//     ed e' avanti di ~10 minuti di film;
//   - ffmpeg e' in BACK-PRESSURE: si rifiuta di leggere 33MB che TorrServer gli
//     tiene in coda (`rwnd_limited: 99.7%`), perche' server.js gli ha detto
//     "fermati, ho abbastanza segmenti".
// Cioe': i segmenti che il player chiede ESISTONO GIA', minuti prima. La consegna
// e' scagionata; lo stall nasce dentro la pagina. Ma da fuori della pagina i due
// meccanismi possibili sono indistinguibili, e vogliono fix OPPOSTI:
//
//   (A) buffer PIENO con un BUCO  -> il gap-controller di hls.js scambia un
//       micro-gap (il transcode AAC ne lascia ai confini dei frammenti) per uno
//       stallo, ferma e nudgia currentTime. Si cura con `maxBufferHole` &co.
//   (B) buffer a ZERO            -> il player non riesce a bancare (playlist che
//       avanza pochi segmenti, append MSE lenti). La config di hls.js non c'entra
//       e cambiarla non fa nulla.
//
// Un dettaglio dice che non e' ovvio: gli stall arrivano ogni 20-30s, mentre i
// frammenti audio durano 4s. Se fosse un buco a ogni confine di frammento
// dovremmo singhiozzare ogni 4s. Quel numero non torna -> non tirare a indovinare
// la costante: MISURARE. (Il 2026-06-10 tre deploy sono bruciati su ipotesi non
// verificate prima di fare l'A/B pulito.)
//
// Cosa logga, in ~/.local/state/stremio-player-debug.log:
//   ev:"hls-stall"  -> a ogni `waiting` del <video>: buffer AVANTI in secondi,
//                      video e audio SEPARATI (sono due SourceBuffer: se l'audio
//                      finisce prima, il player stalla anche col video pieno), e
//                      il buco davanti alla testina, se c'e'.
//   ev:"hls-error"  -> bufferStalledError / bufferSeekOverHole / bufferNudgeOnStall
//                      (= il gap-controller che interviene: la firma del caso A).
//   ev:"hls-buffer" -> battito ogni 10s col buffer avanti: dice se in regime il
//                      buffer e' pieno (caso A) o rasoterra (caso B). Senza questo
//                      un singolo campione allo stall non distinguerebbe "buffer
//                      sempre a zero" da "buffer pieno che crolla".
//
// Da RIMUOVERE a diagnosi conclusa (insieme al suo require in HTMLVideo.js).

var BACKEND_PORT = 8765;
var HEARTBEAT_MS = 10000;

// Beacon duplicato (non importa `stremio/common/casaBackend`): questo e' un
// package a se' (workspace `vendor/stremio-video`), non deve dipendere dagli
// alias webpack dell'app che lo consuma. Regola condivisa, quella si': l'host si
// deriva DALLA PAGINA, mai 127.0.0.1 -> da remoto (Mac via Tailscale) il loopback
// e' il Mac e i log sparirebbero in silenzio.
function beacon(payload) {
    try {
        if (typeof window === 'undefined' || !window.location || !navigator.sendBeacon) return;
        var url = 'http://' + window.location.hostname + ':' + BACKEND_PORT + '/debug/player-event';
        navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: 'text/plain' }));
    } catch (_e) { /* best-effort: la sonda non deve MAI rompere il player */ }
}

// Secondi di video gia' bufferizzati DAVANTI a `t`, e il buco se `t` cade fuori
// da ogni range. `null` = non sappiamo (traccia non ancora vista).
function forwardBuffer(ranges, t) {
    if (!ranges || typeof ranges.length !== 'number') return null;
    for (var i = 0; i < ranges.length; i++) {
        var start = ranges.start(i);
        var end = ranges.end(i);
        if (t >= start - 0.001 && t < end) {
            return { ahead: +(end - t).toFixed(3), hole: null };
        }
        if (t < start) {
            // la testina e' in un buco: il prossimo dato inizia a `start`
            return { ahead: 0, hole: { from: +t.toFixed(3), to: +start.toFixed(3), size: +(start - t).toFixed(3) } };
        }
    }
    return { ahead: 0, hole: null };
}

function rangesToArray(ranges) {
    var out = [];
    if (!ranges || typeof ranges.length !== 'number') return out;
    for (var i = 0; i < ranges.length; i++) {
        out.push([+ranges.start(i).toFixed(2), +ranges.end(i).toFixed(2)]);
    }
    return out;
}

function casaHlsProbe(hls, videoElement, Hls) {
    // Ultimi TimeRanges per SourceBuffer: hls.js li consegna su BUFFER_APPENDED, ed
    // e' l'unico modo di vedere le tracce SEPARATE (videoElement.buffered e' gia'
    // la loro intersezione -> nasconderebbe proprio l'asimmetria che cerchiamo:
    // se l'audio finisce prima, il player stalla anche col video pieno).
    //
    // Le chiavi NON sono fisse: hls.js usa `video`+`audio` quando l'audio e' una
    // rendition separata (il nostro caso atteso: server.js lancia due ffmpeg, uno
    // `-c:v copy` e uno `-c:a aac`), ma un SourceBuffer unico `audiovideo` quando
    // il flusso e' muxato. Le raccogliamo generiche invece di assumerne due: cosi'
    // il log dice anche IN QUALE modalita' siamo — cosa che oggi non sappiamo, e
    // che decide se l'asimmetria audio/video e' anche solo possibile.
    var trackRanges = {};
    var heartbeat = null;

    function snapshot(ev, extra) {
        var t = videoElement.currentTime;
        var payload = {
            ev: ev,
            time: +t.toFixed(3),
            readyState: videoElement.readyState,   // <3 = il browser non ha frame per andare avanti
            paused: videoElement.paused,
            // buffer avanti alla testina: la domanda che decide A (pieno, con buco) vs B (vuoto)
            media: forwardBuffer(videoElement.buffered, t),
            mediaRanges: rangesToArray(videoElement.buffered),
            // per-SourceBuffer: {video, audio} oppure {audiovideo}
            tracks: Object.keys(trackRanges).reduce(function(acc, k) {
                acc[k] = forwardBuffer(trackRanges[k], t);
                return acc;
            }, {})
        };
        if (extra) Object.keys(extra).forEach(function(k) { payload[k] = extra[k]; });
        beacon(payload);
    }

    var onWaiting = function() { snapshot('hls-stall'); };
    videoElement.addEventListener('waiting', onWaiting);

    var onBufferAppended = function(_e, data) {
        if (!data || !data.timeRanges) return;
        Object.keys(data.timeRanges).forEach(function(name) {
            if (data.timeRanges[name]) trackRanges[name] = data.timeRanges[name];
        });
    };
    hls.on(Hls.Events.BUFFER_APPENDED, onBufferAppended);

    // Gli errori NON fatali sono il punto: `bufferStalledError` + `bufferSeekOverHole`
    // + `bufferNudgeOnStall` SONO il gap-controller che agisce. Se compaiono a ogni
    // stall, e' il caso (A) e sappiamo su quale costante mettere le mani.
    var onError = function(_e, data) {
        if (!data) return;
        snapshot('hls-error', {
            details: data.details,
            fatal: !!data.fatal,
            errType: data.type,
            reason: data.reason || null,
            // presenti su bufferSeekOverHole / bufferNudgeOnStall
            hole: typeof data.hole === 'number' ? +data.hole.toFixed(3) : null,
            buffer: typeof data.buffer === 'number' ? +data.buffer.toFixed(3) : null
        });
    };
    hls.on(Hls.Events.ERROR, onError);

    heartbeat = setInterval(function() {
        if (videoElement.paused || videoElement.ended) return;   // in pausa non dice nulla
        snapshot('hls-buffer');
    }, HEARTBEAT_MS);

    return function destroy() {
        clearInterval(heartbeat);
        videoElement.removeEventListener('waiting', onWaiting);
        try {
            hls.off(Hls.Events.BUFFER_APPENDED, onBufferAppended);
            hls.off(Hls.Events.ERROR, onError);
        } catch (_e) { /* hls gia' distrutto */ }
    };
}

module.exports = casaHlsProbe;
