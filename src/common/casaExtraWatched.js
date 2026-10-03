// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: "visto" delle righe episodio EXTRA (quelle che Cinemeta non elenca,
// vedi casaExtraVideos.js) — letto e scritto nel BACKEND, perche' il core non
// ha una casella per un episodio che non conosce.
//
// Ogni scrittura manda anche un beacon `casa-extra-watched` (metaId, videoIds,
// watched, source): e' l'unico modo di sapere, dopo, se un visto e' arrivato
// da un tasto dell'utente o dalla ricostruzione automatica.

const { casaBackendUrl, casaBeacon } = require('stremio/common/casaBackend');

// {videoId: {watched, ts, source}}, o null se il backend non risponde.
// ⚠️ null e {} sono cose diverse: con {} la tile puo' fissare i visti
// ricostruiti (sa che il backend non ne ha), con null NON deve (non sa niente,
// e potrebbe riscrivere sopra un "non visto" esplicito).
const fetchExtraWatched = (metaId) => {
    const base = casaBackendUrl('');
    if (!base || !metaId) return Promise.resolve(null);
    return fetch(base + '/stremio-addon/extra-watched/' + encodeURIComponent(metaId), { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d && d.flags && typeof d.flags === 'object' ? d.flags : null))
        .catch(() => null);
};

// Scrive e restituisce i flag aggiornati della serie (null se fallita).
const postExtraWatched = (metaId, videoIds, watched, source) => {
    const base = casaBackendUrl('');
    if (!base || !metaId || !Array.isArray(videoIds) || videoIds.length === 0) return Promise.resolve(null);
    casaBeacon('/debug/player-event', { ev: 'casa-extra-watched', metaId, videoIds, watched, source });
    return fetch(base + '/stremio-addon/extra-watched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metaId, videoIds, watched, source }),
    })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d && d.flags && typeof d.flags === 'object' ? d.flags : null))
        .catch(() => null);
};

module.exports = { fetchExtraWatched, postExtraWatched };
