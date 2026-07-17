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
// aggiungiamo come sottotitolo ESTERNO (overlay robusto, stesso path OpenSubtitles):
// un file per tutto il film -> niente hls in-band, niente chunking, niente
// congelamento. L'auto-select (useSubtitles) gia' preferisce gli EXTRA -> sceglie
// da solo la traccia estratta al posto dell'embedded rotta.
//
// Enumerazione: riusiamo il probe di stremio-server (`/hlsv2/probe`, gia' chiamato
// da canPlayStream) -> nessun reader in piu' lato client. Ogni subtitle stream ha
// `id` (indice fra i soli sub = `0:s:<id>` per ffmpeg), `language`, `title`.

const React = require('react');
const { casaBackendUrl } = require('stremio/common/casaBackend');
const { languages } = require('stremio/common');

// Solo i NOSTRI stream TorrServer (l'estrazione backend risolve hash+idx dall'url).
const TS_URL_RE = /\/stremio-addon\/ts\//;

const useCasaEmbeddedSubs = (video, streamUrl, streamingServerUrl) => {
    // Evita di ri-aggiungere per lo stesso stream (l'effetto rifiora sui cambi di
    // dipendenza); si ri-arma al cambio episodio (streamUrl nuovo).
    const addedForRef = React.useRef(null);
    // Lo switch embedded->Casa va fatto UNA volta per stream (poi non litighiamo
    // con eventuali scelte manuali dell'utente).
    const switchedForRef = React.useRef(null);

    // 1) Enumera i sottotitoli embedded (probe) e aggiungili come ESTERNI Casa.
    React.useEffect(function() {
        if (!streamUrl || !streamingServerUrl) return;
        if (!TS_URL_RE.test(streamUrl)) return;          // non e' un nostro stream
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
    }, [video, streamUrl, streamingServerUrl]);

    // 2) Se il player e' su un sottotitolo EMBEDDED (in-band, quello che si spegne)
    // e la nostra traccia Casa dello stesso sub e' pronta, SWITCHA sull'esterno
    // robusto. Serve perche' l'auto-select (useSubtitles) rispetta una scelta
    // embedded SALVATA e ci si incolla sopra (cerca gli esterni per id, non per
    // lingua -> non vede i nostri) -> senza questo, gli esterni Casa esistono ma
    // non li usa nessuno. Lo switch e' un upgrade trasparente: STESSO sub, stessa
    // lingua, solo consegnato in un file completo invece che a chunk in-band.
    const selectedEmbeddedId = video.state.selectedSubtitlesTrackId;   // 'EMBEDDED_<i>' o null
    const selectedExtraId = video.state.selectedExtraSubtitlesTrackId; // gia' su un esterno?
    const embeddedTracks = video.state.subtitlesTracks;
    const extraTracks = video.state.extraSubtitlesTracks;

    React.useEffect(function() {
        if (!streamUrl || !TS_URL_RE.test(streamUrl)) return;
        if (switchedForRef.current === streamUrl) return;   // gia' switchato per questo stream
        if (selectedExtraId) return;                        // gia' su un esterno: non toccare
        if (!selectedEmbeddedId) return;                    // subs OFF o non ancora scelti: aspetta

        // La lingua dell'embedded selezionato.
        const emb = (embeddedTracks || []).find(function(t) { return t.id === selectedEmbeddedId; });
        const embLang = emb ? emb.lang : null;
        // L'indice del sub (EMBEDDED_<i> <-> CASA_EMB_<i>, stesso ordine dei
        // subtitle stream del file) per disambiguare Italiano vs Italiano (SDH).
        const idxMatch = /EMBEDDED_(\d+)/.exec(selectedEmbeddedId);
        const sameIdxId = idxMatch ? 'CASA_EMB_' + idxMatch[1] : null;

        const casaTracks = (extraTracks || []).filter(function(t) {
            return typeof t.id === 'string' && t.id.indexOf('CASA_EMB_') === 0;
        });
        if (casaTracks.length === 0) return;   // le nostre tracce non sono ancora pronte

        // Preferisci lo STESSO indice (stessa identica traccia); poi la stessa lingua.
        let target = sameIdxId ? casaTracks.find(function(t) { return t.id === sameIdxId; }) : null;
        if (!target && embLang) {
            target = casaTracks.find(function(t) {
                return t.lang === embLang || languages.toCode(t.lang) === languages.toCode(embLang);
            });
        }
        if (!target) return;

        switchedForRef.current = streamUrl;
        video.setExtraSubtitlesTrack(target.id);   // spegne l'embedded, accende l'esterno Casa
    }, [video, streamUrl, selectedEmbeddedId, selectedExtraId, embeddedTracks, extraTracks]);
};

module.exports = useCasaEmbeddedSubs;
