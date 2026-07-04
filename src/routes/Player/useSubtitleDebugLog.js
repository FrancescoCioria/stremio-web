// Instrumentazione DEBUG (temporanea): cattura la PROVA del bug "sottotitoli
// EMBEDDED che spariscono dopo un tot" (ricapitato 2026-07-02, subs interni al
// file, NON gli OpenSubtitles gia' fixati dal render-loop immortale).
//
// Perche' serve: gli embedded fanno un path COMPLETAMENTE diverso dagli extra.
//   - extra (OpenSubtitles) → overlay HTML disegnato dal render-loop di
//     withHTMLSubtitles.js  → gia' blindato (v3.10, try/catch loop immortale).
//   - embedded → transcodifica HLS server-side → cue IN-BAND → texttrack NATIVA
//     del browser (videoElement.textTracks, HTMLVideo.js). hls.subtitleTrack=-1
//     (Stremio disabilita le rendition hls.js). Il fix precedente NON li tocca.
//
// Il debug-log esistente (usePlayerDebugLog) NON traccia i sottotitoli, quindi
// non avevamo registrazione dell'evento. Questo hook legge lo stato reale delle
// texttrack dal DOM + video.state e lo POSTa al backend (stesso endpoint
// /debug/player-event → ~/.local/state/stremio-player-debug.log, ev:
// 'subtitle-state'), cosi' alla PROSSIMA sparizione sappiamo il MECCANISMO
// esatto invece di dedurre a naso (regola: cattura la prova, non teorizzare):
//
//   status = MODE_NOT_SHOWING → il browser/hls ha resettato track.mode (es. su
//                               una nuova texttrack) → fix = ri-assertare 'showing'.
//   status = CUE_SUPPLY_LOW   → mode ok ma le cue smettono di arrivare in-band
//                               (parser/eviction) → fix diverso (nudge/reload).
//   status = ok               → display/positioning (cue.line / CSS), non supply.
//
// Best-effort: sendBeacon, se il backend e' giu' fallisce in silenzio. Da
// rimuovere a diagnosi conclusa.

const React = require('react');

// Backend derivato dall'host della pagina (come useTitleAvailability): sulla TV
// = localhost, dal Mac remoto = beelink-cachyos/IP Tailscale → i POST di debug
// arrivano al backend del Beelink invece che al 127.0.0.1 locale del Mac (dove
// non c'e' backend) → cosi' anche le sessioni remote finiscono nel log.
const ENDPOINT = 'http://' + window.location.hostname + ':8765/debug/player-event';
const HEAL_MS = 1000;         // cadenza del watchdog self-heal (check mode, economico)
const SAMPLE_MS = 4000;       // cadenza della diagnostica verbosa (scan cue)
const HEARTBEAT_MS = 30000;   // log periodico anche se nulla cambia
const CUE_LOW_MS = 2500;      // "cue ahead" sotto cui la supply e' sospetta
const END_GUARD_MS = 8000;    // vicino alla fine e' normale non avere piu' cue

function embeddedIndex(trackId) {
    if (typeof trackId !== 'string' || trackId.indexOf('EMBEDDED_') !== 0) return null;
    const i = parseInt(trackId.slice('EMBEDDED_'.length), 10);
    return isNaN(i) ? null : i;
}

function snapshotTextTracks(videoEl, timeMs) {
    if (!videoEl || !videoEl.textTracks) return [];
    return Array.from(videoEl.textTracks).map(function(track, i) {
        const cues = track.cues ? Array.from(track.cues) : [];
        let maxEndMs = null;
        let activeCount = 0;
        let activeText = null;
        for (let j = 0; j < cues.length; j++) {
            const c = cues[j];
            const endMs = c.endTime * 1000;
            if (maxEndMs === null || endMs > maxEndMs) maxEndMs = endMs;
            if (timeMs !== null && c.startTime * 1000 <= timeMs && timeMs <= endMs) {
                activeCount++;
                if (activeText === null && typeof c.text === 'string') {
                    activeText = c.text.slice(0, 60);
                }
            }
        }
        return {
            i: i,
            mode: track.mode,          // 'showing' | 'hidden' | 'disabled'
            kind: track.kind,
            label: track.label || null,
            lang: track.language || null,
            cues: cues.length,
            maxEndMs: maxEndMs === null ? null : Math.round(maxEndMs),
            active: activeCount,
            activeText: activeText,
        };
    });
}

function deriveStatus(s) {
    // s: { selEmbeddedIdx, selExtra, tracks, timeMs, durMs, playing }
    if (s.selExtra != null) return 'external'; // path gia' fixato, loggato per completezza
    if (s.selEmbeddedIdx == null) return 'none';
    const track = s.tracks.find(function(t) { return t.i === s.selEmbeddedIdx; });
    if (!track) return 'TRACK_MISSING';        // la texttrack selezionata e' sparita del tutto
    if (track.mode !== 'showing') return 'MODE_NOT_SHOWING';
    if (s.playing && s.timeMs != null) {
        const nearEnd = s.durMs != null && s.timeMs > s.durMs - END_GUARD_MS;
        const ahead = track.maxEndMs != null ? track.maxEndMs - s.timeMs : 0;
        if (!nearEnd && track.cues > 0 && ahead < CUE_LOW_MS) return 'CUE_SUPPLY_LOW';
    }
    return 'ok';
}

const useSubtitleDebugLog = (video) => {
    const prev = React.useRef({ sig: null, status: null, lastPostAt: 0, lastSampleAt: 0 });
    // Ref aggiornata ad ogni render: il player ri-renderizza di continuo
    // (video.state.time), quindi l'interval va armato UNA volta al mount e
    // leggere il video piu' recente via ref — non ricreato ad ogni render
    // (altrimenti il clear/re-init lo azzererebbe prima che scatti = mai loggato).
    const videoRef = React.useRef(video);
    videoRef.current = video;

    React.useEffect(function() {
        function post(payload) {
            try {
                const blob = new Blob([JSON.stringify(payload)], { type: 'text/plain' });
                navigator.sendBeacon(ENDPOINT, blob);
            } catch (e) {
                // best-effort
            }
        }

        const id = setInterval(function() {
            const st = videoRef.current.state;
            const selEmbedded = st.selectedSubtitlesTrackId || null;
            const selExtra = st.selectedExtraSubtitlesTrackId || null;
            // Attivo solo quando c'e' un sottotitolo selezionato (embedded o extra).
            if (selEmbedded == null && selExtra == null) return;

            const videoEl = document.querySelector('video');
            const timeMs = typeof st.time === 'number' && isFinite(st.time) ? st.time : null;
            const durMs = typeof st.duration === 'number' && isFinite(st.duration) ? st.duration : null;
            const playing = st.paused === false && st.buffering === false;
            const selEmbeddedIdx = embeddedIndex(selEmbedded);

            // --- SELF-HEAL (ogni tick, economico: nessuno scan di cue) ---
            // Recovery confermato dall'utente = "metti altri subs poi torna a
            // quelli spariti" = ri-selezionare la track = HTMLVideo rimette
            // track.mode='showing'. Quindi la sparizione degli embedded = il
            // browser/hls resetta mode a non-showing sulla track ancora
            // selezionata (le cue restano — se fosse supply, togglare non le
            // riporterebbe). Qui facciamo AUTOMATICAMENTE quel toggle: se la
            // texttrack selezionata esiste ma non e' 'showing', la ripristiniamo.
            // Superset del recovery manuale; agisce SOLO con un embedded
            // selezionato (subs OFF => selected=null => niente heal).
            let healed = null;
            if (selEmbeddedIdx != null && videoEl && videoEl.textTracks) {
                const selTrack = videoEl.textTracks[selEmbeddedIdx];
                if (selTrack && selTrack.mode !== 'showing') {
                    healed = { index: selEmbeddedIdx, prevMode: selTrack.mode };
                    selTrack.mode = 'showing';
                }
            }
            if (healed) {
                post({
                    ev: 'subtitle-heal',
                    index: healed.index,
                    prevMode: healed.prevMode,
                    sel: { embedded: selEmbedded, extra: selExtra },
                    time: timeMs, playing: playing,
                    paused: st.paused, buffering: st.buffering,
                });
            }

            // --- DIAGNOSTICA VERBOSA (throttled: scan cue solo ogni SAMPLE_MS o su heal) ---
            const now = Date.now();
            const p = prev.current;
            if (!healed && now - p.lastSampleAt < SAMPLE_MS) return;
            p.lastSampleAt = now;

            const tracks = snapshotTextTracks(videoEl, timeMs);

            const status = deriveStatus({
                selEmbeddedIdx: selEmbeddedIdx,
                selExtra: selExtra,
                tracks: tracks,
                timeMs: timeMs,
                durMs: durMs,
                playing: playing,
            });

            // Firma = cosa e' selezionato + numero/mode delle texttrack (cambi
            // strutturali = candidati momento-del-guasto).
            const sig = JSON.stringify({
                e: selEmbedded, x: selExtra, n: tracks.length,
                m: tracks.map(function(t) { return t.mode; }),
            });

            const failure = status === 'MODE_NOT_SHOWING' || status === 'CUE_SUPPLY_LOW' || status === 'TRACK_MISSING';
            const changed = sig !== p.sig || status !== p.status;
            const heartbeat = now - p.lastPostAt > HEARTBEAT_MS;
            // POSTa su: cambio strutturale/stato, ogni sample in stato di guasto,
            // heartbeat periodico, o subito dopo un heal (per registrare il
            // 'dopo'). Evita spam nello stato 'ok' stazionario.
            if (!changed && !failure && !heartbeat && !healed) return;

            p.sig = sig;
            p.status = status;
            p.lastPostAt = now;

            post({
                ev: 'subtitle-state',
                status: status,
                healedThisTick: !!healed,
                videoFound: !!videoEl,
                sel: { embedded: selEmbedded, extra: selExtra },
                time: timeMs, duration: durMs, playing: playing,
                paused: st.paused, buffering: st.buffering,
                offset: st.subtitlesOffset,
                stateEmbeddedTracks: Array.isArray(st.subtitlesTracks) ? st.subtitlesTracks.length : null,
                stateExtraTracks: Array.isArray(st.extraSubtitlesTracks) ? st.extraSubtitlesTracks.length : null,
                domTracks: tracks,
            });
        }, HEAL_MS);

        return function() { clearInterval(id); };
    }, []);
};

module.exports = useSubtitleDebugLog;
