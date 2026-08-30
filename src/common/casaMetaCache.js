// Copyright (C) 2017-2026 Smart code 203358507

// Metadati Cinemeta (descrizione, generi, cast, regista, logo, sfondo, voto
// IMDb) di un titolo, con cache che sopravvive al reload + un `warm()` per
// scaldarli PRIMA che servano.
//
// ⚠️ Prima vivevano in una Map dentro BoardHero e si popolavano solo al focus:
// ogni ricarica del bundle ricominciava da zero, e su ogni card mai visitata
// l'hero restava a meta' finche' la rete non rispondeva. Sono dati che non
// cambiano — un film uscito l'anno scorso non cambia regista.

const { PersistentCache } = require('./casaPersistentCache');

const CINEMETA = 'https://v3-cinemeta.strem.io/meta/';
// I metadati di un titolo sono praticamente immutabili: l'unica cosa che si
// muove e' `imdbRating`, e non di molto in una settimana.
const cache = new PersistentCache('cinemeta', { ttlMs: 7 * 24 * 60 * 60 * 1000, maxEntries: 400 });
const inflight = new Map();

// I campi che l'hero usa. Si tiene SOLO questa lista: il meta completo di
// Cinemeta include `videos` (centinaia di episodi per una serie lunga) e
// riempirebbe la quota di localStorage da solo.
const FIELDS = ['description', 'genres', 'cast', 'director', 'imdbRating', 'releaseInfo', 'runtime', 'background', 'logo'];

// `tt12345:1:1` (episodio) -> `tt12345`: Cinemeta vuole il titolo padre.
const baseIdOf = (id) => {
    const m = id ? String(id).match(/^(tt\d+|kitsu:\d+)/) : null;
    return m ? m[1] : null;
};

const keyOf = (type, id) => `${type}:${id}`;

const getCached = (type, id) => {
    const baseId = baseIdOf(id);
    return baseId ? cache.get(keyOf(type, baseId)) : null;
};

// Scarica e mette in cache. Se e' gia' in cache o gia' in volo non fa nulla:
// il prefetch della home e il focus dell'utente chiedono gli stessi titoli.
const warmMeta = (type, id) => {
    const baseId = baseIdOf(id);
    if (!type || !baseId) return Promise.resolve(null);
    const key = keyOf(type, baseId);
    const hit = cache.get(key);
    if (hit) return Promise.resolve(hit);
    const running = inflight.get(key);
    if (running) return running;
    const p = fetch(`${CINEMETA}${encodeURIComponent(type)}/${encodeURIComponent(baseId)}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
            if (!data || !data.meta) return null;
            const enrichment = {};
            for (const f of FIELDS) {
                const v = data.meta[f];
                // Filtra undefined/null: un campo assente NON deve cancellare
                // quello che l'item aveva gia' quando i due si fondono.
                if (v !== undefined && v !== null) enrichment[f] = v;
            }
            cache.set(key, enrichment);
            return enrichment;
        })
        .catch(() => null)
        .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
};

module.exports = { warmMeta, getCached, baseIdOf };
