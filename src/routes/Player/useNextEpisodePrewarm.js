// Prefetch dell'episodio successivo (custom Casa).
//
// Una serie la si guarda tutta: quando l'episodio N sta riproducendo da un po',
// diciamo al backend di scaldare l'N+1 su TorrServer (metadata dei candidati +
// primi ~200MB del torrent con lo stesso bingeGroup). Cosi' quando finisce
// l'episodio e binge-watching porta alla lista stream del successivo, la race
// "Auto" trova i metadata gia' risolti e i primi byte gia' in cache su disco:
// il play parte quasi subito invece dei soliti 10-30s a freddo.
//
// La logica sta TUTTA nel backend (launcher/backend/src/stremio_addon.ts,
// prewarmEpisode): qui mandiamo solo il beacon, una volta sola per episodio.
//
// Guardie:
//   - solo per i NOSTRI stream (url /ts/<hash>/<idx>): un file locale o uno
//     stream HTTP non hanno niente da scaldare su TorrServer;
//   - solo dopo PREWARM_AFTER_MS di riproduzione: se l'utente cambia idea nei
//     primi minuti (succede: sbaglia episodio, il torrent fa schifo) non
//     abbiamo sprecato banda ne' rubato swarm alla riproduzione in corso;
//   - una volta per id: l'effect gira ad ogni time update.

const React = require('react');
const { casaBeacon } = require('stremio/common/casaBackend');
const { hashFromUrl } = require('stremio/common/torrentRace');

const ENDPOINT = '/stremio-addon/prewarm';
const PREWARM_AFTER_MS = 120 * 1000; // video.state.time e' in ms

// Indice della traccia sottotitoli INTERNA al file attualmente in uso.
//
// ⚠️ Vanno guardate ENTRAMBE le selezioni, non solo quella embedded. Lo stesso
// sottotitolo viene consegnato in due modi — in-band `EMBEDDED_<n>` all'inizio,
// poi la `CASA_EMB_<n>` estratta in VTT che subentra in silenzio — e il beacon
// parte a 2 MINUTI, quando l'upgrade e' quasi sempre gia' avvenuto: guardando
// solo `selectedSubtitlesTrackId` si troverebbe `null` praticamente sempre e il
// prewarm dei sub non partirebbe MAI, senza un errore da nessuna parte.
// OpenSubtitles o sub spenti -> null: li' non c'e' niente da estrarre.
const EMBEDDED_RE = /^EMBEDDED_(\d+)$/;
const CASA_RE = /^CASA_EMB_(\d+)$/;
const embeddedTrackIndex = (embeddedId, extraId) => {
    const m = EMBEDDED_RE.exec(String(embeddedId ?? '')) || CASA_RE.exec(String(extraId ?? ''));
    return m ? Number(m[1]) : null;
};

const useNextEpisodePrewarm = (player, video, type) => {
    const sentFor = React.useRef(null);

    React.useEffect(() => {
        const next = player.nextVideo;
        const stream = player.selected && player.selected.stream;
        if (!next || typeof next.id !== 'string' || !stream) return;
        // Solo i NOSTRI stream: un file locale o un url http qualsiasi non ha
        // niente da scaldare su TorrServer.
        const currentHash = stream.url && hashFromUrl(stream.url);
        if (!currentHash) return;
        if (sentFor.current === next.id) return;
        const time = video.state.time;
        if (typeof time !== 'number' || time < PREWARM_AFTER_MS) return;

        sentFor.current = next.id;
        const bh = stream.behaviorHints;
        casaBeacon(ENDPOINT, {
            type: type,
            id: next.id,
            // Il bingeGroup dello stream in corso: il backend cerca lo stesso
            // gruppo fra gli stream del prossimo episodio (= stesso uploader e
            // stessa qualita') e scalda quello.
            bingeGroup: (bh && bh.bingeGroup) || null,
            // Se il prossimo episodio finisse sullo STESSO torrent (season pack)
            // il backend salta il warm dei byte: un secondo reader sullo stesso
            // torrent fa thrashing sulla cache del film in corso.
            currentHash: currentHash,
            // La traccia sottotitoli in uso ORA. Il backend estrae in anticipo
            // il VTT corrispondente del prossimo episodio, cosi' il binge non
            // paga i ~70s di cold-start (l'estrazione costa quanto scaricare
            // l'intero file: farla adesso, con 40 minuti di episodio davanti,
            // e' gratis). Il prossimo episodio ha quasi sempre lo stesso layout
            // di tracce; se non l'avesse, si ricade sull'estrazione a richiesta.
            // Sub spenti o traccia non embedded -> null, non si prepara nulla.
            subTrack: embeddedTrackIndex(
                video.state.selectedSubtitlesTrackId,
                video.state.selectedExtraSubtitlesTrackId,
            )
        });
    }, [
        player.nextVideo,
        player.selected,
        video.state.time,
        video.state.selectedSubtitlesTrackId,
        video.state.selectedExtraSubtitlesTrackId,
        type,
    ]);
};

module.exports = useNextEpisodePrewarm;
