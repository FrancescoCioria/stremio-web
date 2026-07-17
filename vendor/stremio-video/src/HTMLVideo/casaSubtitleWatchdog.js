// Casa: watchdog di SUPPLY dei sottotitoli EMBEDDED (in-band, path HLS transcode).
//
// PROBLEMA (provato dal log, 2026-07-16 "Due Spicci", subs embedded-only):
// gli embedded forzano un transcode HLS server-side; hls.js carica UNA finestra
// di cue (~1.5-2.5 min avanti) e poi il suo subtitle-stream-controller si ferma
// (bug intermittente noto, video-dev/hls.js#4345/#4530): il fronte (l'ultima cue
// disponibile) NON avanza piu' mentre video/audio scorrono lisci (buffering:false).
// Le cue si consumano, i sottotitoli spariscono. Firma nel player-debug.log:
//   cues:43 maxEndMs:1165800 time:1057726  -> ... -> cues:0 maxEndMs:null (BLANK)
// col fronte maxEndMs CONGELATO su un valore che il playhead poi supera.
//
// RECOVERY MANUALE dell'utente (confermato): "seleziona un altro sottotitolo,
// poi torna su quello di prima" -> hls.js ri-seleziona la subtitle track ->
// ricarica una finestra fresca dalla posizione corrente. Frustrante perche' va
// rifatto ogni ~30s-2min.
//
// QUESTO watchdog automatizza ESATTAMENTE quel recovery, ma nei termini di hls.js
// (`hls.subtitleTrack = -1` poi di nuovo l'indice), che ricarica SOLO la subtitle
// track dalla posizione corrente: NESSUN reload del video (a differenza del
// cambio di traccia embedded lato server), quindi zero interruzione dell'immagine.
// E' un superset stretto del recovery manuale: agisce solo quando i subs sono
// GIA' spariti (fronte dietro il playhead) -> non c'e' nulla da rompere.
//
// NB: NON e' il fix del render-loop (path extra/OpenSubtitles, gia' blindato in
// withHTMLSubtitles.js) ne' il self-heal del `mode` (useSubtitleDebugLog.js, che
// qui e' inerte: il mode resta 'showing', 0 heal nel log). E' un terzo path.
//
// Perche' NON in casaHlsProbe.js: quello e' osservabilita' pura ("non rompe MAI
// il player"). Questo AGISCE sul player -> tenuto separato, esplicito.

var BACKEND_PORT = 8765;
var TICK_MS = 2000;          // cadenza del controllo (economico: legge cue dal DOM)
var LOW_MS = 6000;           // "cue ahead" sotto cui la supply e' esaurita
var END_GUARD_MS = 15000;    // vicino alla fine e' normale non avere piu' cue
var COOLDOWN_MS = 6000;      // attesa minima fra due re-pump (hls deve poter ricaricare)
var MAX_STALE = 4;           // re-pump consecutivi senza crescita del fronte -> back-off

function beacon(payload) {
    try {
        if (typeof window === 'undefined' || !window.location || !navigator.sendBeacon) return;
        var url = 'http://' + window.location.hostname + ':' + BACKEND_PORT + '/debug/player-event';
        navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: 'text/plain' }));
    } catch (_e) { /* best-effort: il watchdog non deve rompere il player */ }
}

// Traccia sottotitoli attualmente 'showing' (quella selezionata da stremio via
// native mode). Ritorna { index, cues, maxEndMs } o null.
function showingSubtitleTrack(videoElement) {
    if (!videoElement || !videoElement.textTracks) return null;
    var tracks = videoElement.textTracks;
    for (var i = 0; i < tracks.length; i++) {
        var t = tracks[i];
        if (t.mode !== 'showing') continue;
        if (t.kind && t.kind !== 'subtitles' && t.kind !== 'captions') continue;
        var cues = t.cues ? t.cues.length : 0;
        var maxEndMs = null;
        if (t.cues) {
            for (var j = 0; j < t.cues.length; j++) {
                var endMs = t.cues[j].endTime * 1000;
                if (maxEndMs === null || endMs > maxEndMs) maxEndMs = endMs;
            }
        }
        return { index: i, cues: cues, maxEndMs: maxEndMs };
    }
    return null;
}

// DECISIONE PURA (unit-testabile, nessun side-effect). state e' mutabile e viene
// aggiornato in-place; ritorna { repump, reason }.
//   sample: { timeMs, durMs, cues, maxEndMs, playing, nowMs }
//   state:  { lastRepumpAt, lastRepumpMaxEnd, staleCount, backoffFrontMs }
function decideRepump(state, sample) {
    if (!sample.playing || sample.timeMs == null) return { repump: false, reason: 'not-playing' };

    // Vicino alla fine: normale che non ci siano piu' cue -> non e' un guasto.
    if (sample.durMs != null && sample.timeMs > sample.durMs - END_GUARD_MS) {
        return { repump: false, reason: 'near-end' };
    }

    // Quanto avanti arriva l'ultima cue. Senza cue = fronte gia' passato.
    var ahead = sample.maxEndMs != null ? sample.maxEndMs - sample.timeMs : -Infinity;
    if (ahead >= LOW_MS) {
        // Supply sana: resetta lo stato di back-off/stale.
        state.staleCount = 0;
        state.backoffFrontMs = null;
        state.lastRepumpMaxEnd = null;
        return { repump: false, reason: 'healthy' };
    }

    // Back-off: dopo troppi re-pump inutili (fronte che non cresce = subs
    // genuinamente finiti/assenti in questo punto) smettiamo di flippare, o
    // andremmo in loop infinito su un file il cui embedded copre solo una parte.
    // Restiamo in back-off finche' o un tick sano lo resetta (ramo 'healthy'
    // sopra, quando la supply riprende bene) o compaiono cue NUOVE oltre il
    // fronte esaurito (supply ripartita da sola). NON ci basiamo sul playhead:
    // il playhead supera comunque un fronte congelato -> re-arm istantaneo -> flip.
    if (state.backoffFrontMs != null) {
        var newSupply = sample.maxEndMs != null && sample.maxEndMs > state.backoffFrontMs + 500;
        if (newSupply) {
            state.backoffFrontMs = null;
            state.staleCount = 0;
            state.lastRepumpMaxEnd = null;
        } else {
            return { repump: false, reason: 'backoff' };
        }
    }

    // Cooldown: dopo un re-pump dai a hls.js il tempo di ricaricare.
    if (state.lastRepumpAt != null && sample.nowMs - state.lastRepumpAt < COOLDOWN_MS) {
        return { repump: false, reason: 'cooldown' };
    }

    // Il re-pump precedente ha fatto crescere il fronte? Se no, e' inutile.
    if (state.lastRepumpMaxEnd != null) {
        var grew = sample.maxEndMs != null && sample.maxEndMs > state.lastRepumpMaxEnd + 500;
        if (grew) {
            state.staleCount = 0;
        } else {
            state.staleCount = (state.staleCount || 0) + 1;
            if (state.staleCount >= MAX_STALE) {
                state.backoffFrontMs = sample.maxEndMs != null ? sample.maxEndMs : sample.timeMs;
                return { repump: false, reason: 'exhausted' };
            }
        }
    }

    state.lastRepumpAt = sample.nowMs;
    state.lastRepumpMaxEnd = sample.maxEndMs;
    return { repump: true, reason: sample.cues > 0 ? 'supply-low' : 'no-cues' };
}

function casaSubtitleWatchdog(hls, videoElement) {
    var state = { lastRepumpAt: null, lastRepumpMaxEnd: null, staleCount: 0, backoffFrontMs: null };

    // Re-pump: ricarica la subtitle track corrente nei termini di hls.js. Con
    // renderTextTracksNatively (default) stremio seleziona i subs settando il
    // native mode e hls.js si allinea -> `hls.subtitleTrack` riflette la track
    // showing. Toggle -1 -> indice = reset del subtitle-stream-controller +
    // reload dalla posizione corrente. Se hls non la sta gestendo (subtitleTrack
    // -1 con una native track showing), ripiego sul toggle del native mode
    // (esattamente il gesto manuale).
    function repump(showing) {
        var hlsIdx = (hls && typeof hls.subtitleTrack === 'number') ? hls.subtitleTrack : -1;
        var via;
        if (hlsIdx >= 0) {
            via = 'hls';
            try {
                hls.subtitleTrack = -1;
                setTimeout(function() { try { hls.subtitleTrack = hlsIdx; } catch (_e) {} }, 0);
            } catch (_e) { via = 'hls-error'; }
        } else {
            via = 'native';
            try {
                var track = videoElement.textTracks[showing.index];
                if (track) {
                    track.mode = 'disabled';
                    setTimeout(function() { try { track.mode = 'showing'; } catch (_e) {} }, 0);
                }
            } catch (_e) { via = 'native-error'; }
        }
        // Assicura che, qualunque via, la track selezionata resti 'showing' (la
        // derivazione di selectedSubtitlesTrackId in stremio legge il native mode:
        // non deve credere che l'utente abbia tolto i subs).
        setTimeout(function() {
            try {
                var t = videoElement.textTracks[showing.index];
                if (t && t.mode !== 'showing') t.mode = 'showing';
            } catch (_e) {}
        }, 50);
        return via;
    }

    var id = setInterval(function() {
        if (videoElement.paused || videoElement.ended) return;
        var showing = showingSubtitleTrack(videoElement);
        if (!showing) return;   // nessun sottotitolo selezionato -> niente da fare

        var timeMs = isFinite(videoElement.currentTime) ? videoElement.currentTime * 1000 : null;
        var durMs = isFinite(videoElement.duration) ? videoElement.duration * 1000 : null;

        var decision = decideRepump(state, {
            timeMs: timeMs,
            durMs: durMs,
            cues: showing.cues,
            maxEndMs: showing.maxEndMs,
            playing: true,
            nowMs: Date.now()
        });

        if (decision.repump) {
            var via = repump(showing);
            beacon({
                ev: 'subtitle-repump',
                via: via,
                reason: decision.reason,
                index: showing.index,
                cues: showing.cues,
                maxEndMs: showing.maxEndMs != null ? Math.round(showing.maxEndMs) : null,
                aheadMs: showing.maxEndMs != null && timeMs != null ? Math.round(showing.maxEndMs - timeMs) : null,
                time: timeMs != null ? Math.round(timeMs) : null,
                duration: durMs != null ? Math.round(durMs) : null,
                staleCount: state.staleCount
            });
        }
    }, TICK_MS);

    return function destroy() {
        clearInterval(id);
    };
}

casaSubtitleWatchdog.decideRepump = decideRepump;
casaSubtitleWatchdog.showingSubtitleTrack = showingSubtitleTrack;
module.exports = casaSubtitleWatchdog;
