// Casa: fix strutturale dei sottotitoli EMBEDDED che "si spengono a meta' film".
//
// ORIGINE (provata dai log + ffmpeg, 2026-07-17): stremio-server NON estrae i
// sottotitoli embedded in continuo. I suoi due ffmpeg (video+audio) ESCLUDONO i
// sub (`-map -0:s?`); li tira fuori in un chunk one-shot alla selezione/seek e poi
// smette -> il fronte delle cue in-band si congela, hls le consuma, lo schermo
// resta muto. Il "cambia sottotitolo e torna" li rigenera solo perche' ri-lancia
// il chunk. Il watchdog che ri-toggla la subtitle track in hls e' inutile: non fa
// ripartire l'estrazione lato server (provato: 4 repump, fronte fermo).
//
// FIX: quando il file ha sottotitoli embedded, chiediamo al backend di estrarre
// l'INTERA traccia in un VTT completo (subrip -> WebVTT, cache su disco, ~1s) e la
// aggiungiamo come sottotitolo ESTERNO `CASA_EMB_<n>` (overlay robusto, stesso
// path OpenSubtitles): un file per tutto il film -> niente hls in-band, niente
// chunking, niente congelamento.
//
// ⚠️ QUESTO HOOK NON SELEZIONA NIENTE — e non deve tornare a farlo.
// La v4.31 ci aveva messo uno switch programmatico embedded->Casa. Perdeva sempre,
// e il log del 2026-07-18 lo mostra col playhead ancora a 1.8s:
//
//     19:01:35  sel={embedded:null, extra:"CASA_EMB_0"}   <- lo switch
//     19:01:39  sel={embedded:"EMBEDDED_0", extra:null}   <- auto-select, 4s dopo
//
// L'auto-select di `useSubtitles` rigira ad ogni cambio di `subtitlesTracks`, e
// quella lista e' derivata LIVE da `videoElement.textTracks`: hls.js aggiunge le
// tracce in-band man mano che parsa i segmenti, quindi l'effetto rifiora secondi
// dopo il load e ha sempre l'ultima parola. La selezione giusta si ottiene
// insegnandogli a risolvere `EMBEDDED_<n>` -> `CASA_EMB_<n>` (alias in
// `casaEmbeddedSubs.js`, usato in `useSubtitles`), NON combattendolo da qui.
//
// Enumerazione: riusiamo il probe di stremio-server (`/hlsv2/probe`, gia' chiamato
// da canPlayStream) -> nessun reader in piu' lato client. Ogni subtitle stream ha
// `id` (indice fra i soli sub = `0:s:<id>` per ffmpeg), `language`, `title`.

const React = require('react');
const { casaBackendUrl } = require('stremio/common/casaBackend');
const { streamUrlMatchesVideo } = require('stremio/common/casaEmbeddedSubs');

// Solo i NOSTRI stream TorrServer (l'estrazione backend risolve hash+idx dall'url).
const TS_URL_RE = /\/stremio-addon\/ts\//;

const useCasaEmbeddedSubs = (video, streamUrl, streamingServerUrl, selectedVideoId) => {
    // Evita di ri-aggiungere per lo stesso stream (l'effetto rifiora sui cambi di
    // dipendenza); si ri-arma al cambio episodio (streamUrl nuovo).
    const addedForRef = React.useRef(null);

    React.useEffect(function() {
        if (!streamUrl || !streamingServerUrl) return;
        if (!TS_URL_RE.test(streamUrl)) return;          // non e' un nostro stream

        // ⚠️ GUARDIA ANTI-STALE (incidente 2026-07-18, binge E02->E03).
        // Al cambio episodio il core espone per ~1s uno stato incoerente:
        // `selected` e' gia' l'episodio nuovo, `stream.url` e' ancora quello
        // VECCHIO. Misurato allo stesso secondo (21:24:45):
        //     ts            ... se=S1E3   <- il video: episodio giusto
        //     embedded-subs ... -1x2-     <- i sub: episodio PRECEDENTE
        // Senza guardia estraiamo (e mettiamo in CACHE) i sottotitoli
        // dell'episodio sbagliato e armiamo `addedForRef` su una url che non
        // verra' mai riprodotta -> il lavoro giusto non parte piu' e l'episodio
        // resta sull'in-band rotta per tutta la durata. Si aspetta: l'effetto
        // rifiora appena `streamUrl` si allinea (e' fra le dipendenze).
        if (!streamUrlMatchesVideo(streamUrl, selectedVideoId)) return;

        if (addedForRef.current === streamUrl) return;   // gia' fatto per questo stream

        let cancelled = false;
        const base = String(streamingServerUrl).replace(/\/$/, '');
        const probeUrl = base + '/hlsv2/probe?mediaURL=' + encodeURIComponent(streamUrl);

        fetch(probeUrl)
            .then(function(r) { return r.json(); })
            .then(function(probe) {
                if (cancelled) return;
                const subs = (probe && Array.isArray(probe.streams) ? probe.streams : [])
                    .filter(function(s) { return s && s.track === 'subtitle'; });
                if (subs.length === 0) return;

                // Segna PRIMA dell'add: se l'effetto rifiora non raddoppiamo.
                addedForRef.current = streamUrl;

                const tracks = subs.map(function(s) {
                    const backend = casaBackendUrl(
                        '/stremio-addon/embedded-subs.vtt?media=' + encodeURIComponent(streamUrl) +
                        '&track=' + String(s.id));
                    return {
                        // ⚠️ L'INDICE deve combaciare con quello dell'EMBEDDED_<n>
                        // che rimpiazza: e' cosi' che l'auto-select risolve l'alias
                        // (e distingue "Italian" da "Italian (SDH)", stessa lingua).
                        id: 'CASA_EMB_' + String(s.id),
                        url: backend,
                        lang: s.language || 'und',
                        label: s.title || s.language || ('Sub ' + String(s.id)),
                        origin: 'Casa',      // richiesto (string) dal filtro di withHTMLSubtitles
                        embedded: false,     // deve essere falsy: e' un ESTERNO overlay
                    };
                }).filter(function(t) { return t.url != null; });

                if (tracks.length > 0) video.addExtraSubtitlesTracks(tracks);
            })
            .catch(function() { /* best-effort: se il probe fallisce, resta il path in-band */ });

        return function() { cancelled = true; };
    }, [video, streamUrl, streamingServerUrl, selectedVideoId]);
};

module.exports = useCasaEmbeddedSubs;
