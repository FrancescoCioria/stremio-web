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
// FIX: il backend estrae l'INTERA traccia in un VTT completo (subrip -> WebVTT,
// cache su disco) e noi la aggiungiamo come sottotitolo ESTERNO `CASA_EMB_<n>`
// (overlay robusto, stesso path OpenSubtitles). Un file per tutto l'episodio ->
// niente chunking, niente congelamento. Misurato su S01E04: 812 cue da 00:14 a
// 40:02, cioe' l'episodio intero in un colpo solo.
//
// ⚠️ PER L'UTENTE E' LO STESSO SOTTOTITOLO. La `CASA_EMB_<n>` non e' una voce di
// menu: e' il backing della `EMBEDDED_<n>`. Il menu ne mostra UNA (vedi
// `casaEmbeddedSubs.js`), e il passaggio dall'una all'altra non si deve vedere.
//
// ⚠️ QUESTO HOOK NON SELEZIONA NIENTE. La v4.31 ci aveva messo uno switch e
// perdeva sempre: l'auto-select di `useSubtitles` rifiora ad ogni cambio di
// `subtitlesTracks` (lista derivata LIVE da `videoElement.textTracks`, che hls.js
// popola progressivamente) e ha l'ultima parola. Log del 2026-07-18: agganciato
// alle 19:01:35, sganciato alle 19:01:39 col playhead a 1.8s. La selezione si
// governa da `useSubtitles`, non da qui.
//
// ⚠️ PREPARAZIONE GUIDATA DALLA DOMANDA — non registrare tutto in anticipo.
// Due motivi, entrambi misurati sul campo il 2026-07-18:
//   1. COSTO. Un file ha anche 37 tracce embedded; preparare tutto = 37 ffmpeg
//      che leggono il container fino all'ultimo pacchetto sub. Si prepara SOLO
//      la traccia che l'utente sta guardando.
//   2. IL BUCO INIZIALE. Registrare la traccia PRIMA che il VTT esista faceva
//      selezionare all'auto-select un file inesistente: su S01E04 (torrent
//      freddo) l'estrazione ha impiegato 59s e per quel minuto NON c'erano
//      sottotitoli affatto — una regressione rispetto all'in-band, che parte
//      subito. Ora la traccia si aggiunge solo QUANDO il VTT e' pronto: fino a
//      quel momento suona l'in-band (che regge ~5 min, ampiamente sufficienti),
//      poi l'upgrade in `useSubtitles` fa il cambio in silenzio.

const React = require('react');
const { casaBackendUrl } = require('stremio/common/casaBackend');
const { streamUrlMatchesVideo } = require('stremio/common/casaEmbeddedSubs');

// Solo i NOSTRI stream TorrServer (l'estrazione backend risolve hash+idx dall'url).
const TS_URL_RE = /\/stremio-addon\/ts\//;
const EMBEDDED_RE = /^EMBEDDED_(\d+)$/;

const useCasaEmbeddedSubs = (video, streamUrl, streamingServerUrl, selectedVideoId) => {
    // Elenco dei sottotitoli embedded del file (dal probe), per stream.
    const [probed, setProbed] = React.useState(null);
    const probedForRef = React.useRef(null);
    // Le tracce gia' preparate (o in preparazione), per non ripartire ad ogni
    // rifioritura dell'effetto. Chiave: `${streamUrl}#${trackIndex}`.
    const preparedRef = React.useRef(new Set());

    // 1) Enumera i sottotitoli embedded. Nessuna registrazione: solo l'elenco.
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
        // dell'episodio sbagliato e ci armiamo su una url che non verra' mai
        // riprodotta -> il lavoro giusto non parte piu' e l'episodio resta
        // sull'in-band rotta per tutta la durata. Si aspetta: l'effetto rifiora
        // appena `streamUrl` si allinea (e' fra le dipendenze).
        if (!streamUrlMatchesVideo(streamUrl, selectedVideoId)) return;

        if (probedForRef.current === streamUrl) return;

        let cancelled = false;
        const base = String(streamingServerUrl).replace(/\/$/, '');
        const probeUrl = base + '/hlsv2/probe?mediaURL=' + encodeURIComponent(streamUrl);

        fetch(probeUrl)
            .then(function(r) { return r.json(); })
            .then(function(probe) {
                if (cancelled) return;
                const subs = (probe && Array.isArray(probe.streams) ? probe.streams : [])
                    .filter(function(s) { return s && s.track === 'subtitle'; });
                probedForRef.current = streamUrl;
                preparedRef.current = new Set();
                setProbed(subs.length > 0 ? { streamUrl: streamUrl, subs: subs } : null);
            })
            .catch(function() { /* best-effort: senza probe resta il path in-band */ });

        return function() { cancelled = true; };
    }, [streamUrl, streamingServerUrl, selectedVideoId]);

    // 2) Prepara SOLO la traccia attualmente selezionata, e la registra quando
    // il VTT e' pronto. Il fetch qui e' il segnale di "pronto": l'endpoint
    // backend risponde solo a estrazione conclusa (o subito, se gia' in cache).
    const selectedEmbeddedId = video.state.selectedSubtitlesTrackId;

    React.useEffect(function() {
        if (!probed || probed.streamUrl !== streamUrl) return;
        if (!selectedEmbeddedId) return;                 // subs off: niente da preparare

        const m = EMBEDDED_RE.exec(String(selectedEmbeddedId));
        if (!m) return;
        const idx = m[1];

        // La traccia embedded selezionata esiste anche fra i sub del container?
        // (gli indici vengono da namespace diversi: vedi casaEmbeddedSubs.js)
        const sub = probed.subs.find(function(s) { return String(s.id) === idx; });
        if (!sub) return;

        const key = streamUrl + '#' + idx;
        if (preparedRef.current.has(key)) return;
        preparedRef.current.add(key);

        let cancelled = false;
        const url = casaBackendUrl(
            '/stremio-addon/embedded-subs.vtt?media=' + encodeURIComponent(streamUrl) +
            '&track=' + idx);
        if (!url) return;

        // A freddo puo' metterci ~1 minuto (ffmpeg deve leggere il container fino
        // all'ultimo pacchetto sub, e il torrent e' ancora indietro). Nel
        // frattempo l'utente sta guardando l'in-band: nessun buco.
        fetch(url)
            .then(function(r) {
                if (!r.ok) throw new Error('vtt non pronto');
                return r.text();
            })
            .then(function(vtt) {
                if (cancelled) return;
                if (!vtt || vtt.indexOf('-->') === -1) throw new Error('vtt vuoto');
                video.addExtraSubtitlesTracks([{
                    // ⚠️ L'INDICE deve combaciare con quello dell'EMBEDDED_<n>
                    // che rimpiazza: e' cosi' che il menu le fonde in una voce
                    // sola e che l'upgrade sa quale sostituire.
                    id: 'CASA_EMB_' + idx,
                    url: url,
                    lang: sub.language || 'und',
                    label: sub.title || sub.language || ('Sub ' + idx),
                    origin: 'Casa',      // richiesto (string) dal filtro di withHTMLSubtitles
                    embedded: false,     // deve essere falsy: e' un ESTERNO overlay
                }]);
            })
            .catch(function() {
                // Fallita: si riprova al prossimo giro (es. altro episodio) e
                // intanto l'in-band resta a coprire. Nessun degrado visibile.
                preparedRef.current.delete(key);
            });

        return function() { cancelled = true; };
    }, [video, probed, streamUrl, selectedEmbeddedId]);
};

module.exports = useCasaEmbeddedSubs;
