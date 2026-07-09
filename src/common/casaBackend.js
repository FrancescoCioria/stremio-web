// Copyright (C) 2017-2023 Smart code 203358507
//
// Punto UNICO per raggiungere il launcher-backend (:8765) dal fork.
//
// Regola: l'host si deriva DALLA PAGINA, mai `127.0.0.1`. Sulla TV la pagina e'
// `localhost:8080` -> backend `localhost:8765`; dal Mac remoto via Tailscale e'
// `beelink-cachyos:8080` / `stremio.casa:8080` -> backend sullo stesso host. Con
// il loopback hardcoded le sessioni remote postano al Mac, dove nessuno ascolta,
// e i log di debug spariscono in silenzio (successo davvero: usePlayerDebugLog
// ha sanguinato cosi' fino al 2026-07-09).
//
// http esplicito: il backend e' solo HTTP, e la pagina pure.
//
// Lazy, non costante di modulo: questo file lo importa anche `torrentRace.js`,
// che gira nei test sotto node dove `window` non esiste.

const BACKEND_PORT = 8765;

// Base URL del backend, o null fuori dal browser.
const casaBackendUrl = (path) => {
    if (typeof window === 'undefined' || !window.location) return null;
    return 'http://' + window.location.hostname + ':' + BACKEND_PORT + (path || '');
};

// POST best-effort di un payload JSON via sendBeacon. `text/plain` di proposito:
// e' una "simple request", quindi niente preflight CORS (che sendBeacon non
// saprebbe gestire). Non lancia mai: il chiamante non deve sapere se e' arrivato.
const casaBeacon = (path, payload) => {
    try {
        const url = casaBackendUrl(path);
        if (!url) return;
        navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: 'text/plain' }));
    } catch (_e) { /* best-effort */ }
};

module.exports = { casaBackendUrl, casaBeacon, BACKEND_PORT };
