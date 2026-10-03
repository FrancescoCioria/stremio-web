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
const { casaBackendUrl } = require('./casaBackend');

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

// Lista episodi di una serie, per sapere qual e' il successivo (casaCreditsSkip).
// ⚠️ NIENTE cache persistente, apposta (vedi FIELDS): e' la parte pesante del
// meta. Si chiede solo al click su una card nei titoli di coda, cioe' raramente.
// Tempo massimo di attesa dal click: oltre, si apre la card come sempre invece
// di lasciare il divano davanti a un click che non fa niente.
const VIDEOS_TIMEOUT_MS = 3000;
const fetchJson = (url) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), VIDEOS_TIMEOUT_MS);
    return fetch(url, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .finally(() => clearTimeout(timer));
};

// Lista Cinemeta + episodi che Cinemeta non elenca ancora (backend, gli stessi
// della lista episodi: casaExtraVideos.js).
// ⚠️ Senza le extra la card nei titoli di coda non trovava il successivo: X Factor
// 03/10/2026, card su E03 al 96,6% con E04 uscito -> `no-next-video` (Cinemeta
// elencava solo E01).
// ⚠️ L'ordine di Cinemeta NON si tocca: il successivo e' "il video dopo nella
// lista" (MetaItem::next_video) e Cinemeta non e' sempre ordinata (Breaking Bad
// S1E7 prima di S1E6, speciali in mezzo alle stagioni). Ogni extra entra subito
// dopo l'ultimo video della SUA stagione con episodio minore; se non ce n'e', in coda.
// Puro: nessuna extra -> la lista di Cinemeta tale e quale.
const withExtraVideos = (videos, extra) => {
    if (!Array.isArray(videos) || !Array.isArray(extra) || extra.length === 0) return videos;
    const have = new Set(videos.map((v) => v && v.id));
    const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
    const add = extra
        .filter((v) => v && typeof v.id === 'string' && !have.has(v.id))
        .sort((a, b) => num(a.season) - num(b.season) || num(a.episode) - num(b.episode));
    if (add.length === 0) return videos;
    const out = videos.slice();
    for (const v of add) {
        let at = -1;
        out.forEach((x, i) => {
            if (x && num(x.season) === num(v.season) && num(x.episode) < num(v.episode)) at = i;
        });
        if (at < 0) out.push(v);
        else out.splice(at + 1, 0, v);
    }
    return out;
};

const fetchSeriesVideos = (type, id) => {
    const baseId = baseIdOf(id);
    if (!type || !baseId) return Promise.resolve(null);
    const backend = type === 'series' ? casaBackendUrl('/stremio-addon/extra-videos/series/' + encodeURIComponent(baseId)) : null;
    return Promise.all([
        fetchJson(`${CINEMETA}${encodeURIComponent(type)}/${encodeURIComponent(baseId)}.json`),
        backend ? fetchJson(backend) : Promise.resolve(null),
    ]).then(([data, extra]) => {
        const videos = data && data.meta && Array.isArray(data.meta.videos) ? data.meta.videos : null;
        return withExtraVideos(videos, extra && Array.isArray(extra.videos) ? extra.videos : null);
    });
};

module.exports = { warmMeta, getCached, baseIdOf, fetchSeriesVideos, withExtraVideos };
