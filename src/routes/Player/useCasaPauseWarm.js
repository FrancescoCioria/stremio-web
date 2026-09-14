// Download in PAUSA (custom Casa).
//
// In pausa il player smette di chiedere segmenti e TorrServer, senza nessuno che
// legge, smette di scaricare: alla ripresa c'erano ~30s pronti e il resto da
// tirare giu'. Qui si tiene acceso un battito mentre il video e' in pausa; il
// backend (launcher/backend/src/pause_warm.ts) apre un reader dal punto di pausa
// e scarica in avanti. La logica sta tutta li'.
//
// Stop espliciti: la cleanup dell'effect manda `release` alla ripresa, all'uscita
// dal film e al cambio di stream. Se la tile muore non parte niente: il backend
// si ferma da solo quando i battiti smettono.

const React = require('react');
const { casaBeacon } = require('stremio/common/casaBackend');
const { hashFromUrl } = require('stremio/common/torrentRace');

const ENDPOINT = '/stremio-addon/pause-warm';
// Il backend chiude dopo 3 battiti persi (BEAT_TIMEOUT_MS).
const BEAT_MS = 30 * 1000;

const useCasaPauseWarm = (player, video) => {
    const stream = player.selected && player.selected.stream;
    // Solo i NOSTRI stream (/ts/<hash>/<idx>): il resto non passa da TorrServer.
    const url = stream && typeof stream.url === 'string' && hashFromUrl(stream.url) ? stream.url : null;
    const hold = video.state.paused === true && url !== null;

    // Posizione letta al momento del battito, non congelata all'avvio dell'effect.
    const positionRef = React.useRef({ time: null, duration: null });
    positionRef.current = { time: video.state.time, duration: video.state.duration };

    React.useEffect(() => {
        if (!hold) return;
        const beat = () => casaBeacon(ENDPOINT, {
            action: 'hold',
            url,
            timeMs: positionRef.current.time,
            durationMs: positionRef.current.duration,
        });
        beat();
        const id = setInterval(beat, BEAT_MS);
        return () => {
            clearInterval(id);
            casaBeacon(ENDPOINT, { action: 'release', url });
        };
    }, [hold, url]);
};

module.exports = useCasaPauseWarm;
