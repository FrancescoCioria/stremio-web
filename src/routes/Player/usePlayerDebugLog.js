// Instrumentazione DEBUG (temporanea): logga ogni transizione di
// paused/buffering/loaded del player allegando lo STATO TORRENT corrente, e la
// POSTa al nostro launcher-backend (sendBeacon → POST /debug/player-event,
// persistito in ~/.local/state/stremio-player-debug.log).
//
// Scopo: capire chi/cosa mette in pausa il film "da solo" e VERIFICARE che gli
// stall (video.state.buffering = true = il player ferma la UI perche' smette di
// arrivare video dal server) avvengano davvero a torrent COMPLETO al 100%
// (streamProgress = 1.0), come osservato dall'utente.
//
// Distinzione chiave nei log:
//   - buffering: true            → stall lato streaming (il server non consegna)
//   - paused: true (no buffering)→ pausa vera (comando esterno MPRIS / utente)
//
// Best-effort: se il backend e' giu', sendBeacon fallisce in silenzio. Da
// rimuovere a diagnosi conclusa.

const React = require('react');
const { casaBeacon } = require('stremio/common/casaBackend');

// Host DALLA PAGINA, non loopback: da remoto (Mac via Tailscale) 127.0.0.1 e' il
// Mac, non il Beelink -> gli eventi si perdevano in silenzio e le sessioni remote
// erano cieche (fixato 2026-07-09). La regola vive in casaBackend.js.
const ENDPOINT = '/debug/player-event';

const usePlayerDebugLog = (video, streamingServer, statistics) => {
    const prev = React.useRef({ paused: undefined, buffering: undefined, loaded: undefined });

    React.useEffect(() => {
        const s = video.state;
        const cur = { paused: s.paused, buffering: s.buffering, loaded: s.loaded };
        const p = prev.current;
        if (cur.paused === p.paused && cur.buffering === p.buffering && cur.loaded === p.loaded) {
            return;
        }
        prev.current = cur;

        const stats = streamingServer.statistics && streamingServer.statistics.type === 'Ready'
            ? streamingServer.statistics.content
            : null;

        const payload = {
            ev: 'player-state',
            // transizione
            paused: cur.paused,
            buffering: cur.buffering,
            loaded: cur.loaded,
            prev: p,
            // posizione player
            time: s.time,
            duration: s.duration,
            // STATO TORRENT (la domanda: stop a 100%?)
            infoHash: statistics.infoHash,
            streamProgress: stats ? stats.streamProgress : null, // 0..1 (1 = 100%)
            completedPct: statistics.completed,                   // streamProgress * 100
            downloaded: stats ? stats.downloaded : null,
            streamLen: stats ? stats.streamLen : null,
            peers: statistics.peers,
            downloadSpeedMBs: statistics.speed,
        };

        casaBeacon(ENDPOINT, payload);
    }, [video.state.paused, video.state.buffering, video.state.loaded]);
};

module.exports = usePlayerDebugLog;
