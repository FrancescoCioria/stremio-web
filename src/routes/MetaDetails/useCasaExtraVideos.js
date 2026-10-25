// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: chiede al backend quali episodi di questa serie esistono ma non sono
// elencati da Cinemeta (`videos`) e i dati TMDB per quelli che Cinemeta elenca
// con la scheda grezza (`repairs`). Il perche' di entrambi in
// common/casaExtraVideos.js.
//
// Fail-soft in ogni ramo: backend spento, rete assente o risposta strana
// valgono "nessun extra", cioe' la lista episodi di sempre. Questa e' una
// rifinitura, non deve poter rompere la pagina della serie.

const React = require('react');
const { casaBackendUrl } = require('stremio/common/casaBackend');

const EMPTY = { videos: [], repairs: [] };

const useCasaExtraVideos = (type, metaId) => {
    const [extra, setExtra] = React.useState(EMPTY);
    React.useEffect(() => {
        setExtra(EMPTY);
        if (type !== 'series' || typeof metaId !== 'string' || !metaId) return;
        const base = casaBackendUrl('');
        if (!base) return;
        let alive = true;
        fetch(base + '/stremio-addon/extra-videos/series/' + encodeURIComponent(metaId))
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (!alive || !d) return;
                setExtra({
                    videos: Array.isArray(d.videos) ? d.videos : [],
                    repairs: Array.isArray(d.repairs) ? d.repairs : [],
                });
            })
            .catch(() => { /* niente extra: la lista resta quella del core */ });
        return () => { alive = false; };
    }, [type, metaId]);
    return extra;
};

module.exports = useCasaExtraVideos;
