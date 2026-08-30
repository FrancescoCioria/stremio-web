// Copyright (C) 2017-2026 Smart code 203358507

const React = require('react');
const { casaBackendUrl } = require('./casaBackend');
const { PersistentCache } = require('./casaPersistentCache');

// Hook: voto Letterboxd di un FILM, dal launcher-backend `/letterboxd/:imdbId`
// (vedi letterboxd.ts). Sta accanto a quello IMDb nel dettaglio: sono due
// pubblici diversi e sui film d'animazione danno ordini quasi opposti
// (misurato: Super Mario Galaxy 8,2/10 su TMDB e 2,89/5 su Letterboxd).
//
// ⚠️ SOLO FILM: Letterboxd non ha le serie. Su una serie non si chiede niente e
// non si mostra niente — non e' un dato mancante, e' un dato che non esiste.
const BACKEND_URL = casaBackendUrl('');

// ⚠️ Letterboxd vota in STELLE, 0,5-5. Accanto a un IMDb su 10 quei numeri
// sembrano tutti disastrosi — un film discreto legge "3.5" e pare bocciato —
// quindi si MOSTRA raddoppiato, sulla stessa scala 1-10 del vicino. E' una
// riscalatura lineare, non cambia nessun ordine.
// ⚠️ Il valore GREZZO resta quello che arriva dal backend, ed e' quello che
// ordina la riga "Ultime uscite" (`rating / 5` in new_releases.ts): la scala
// doppia vive SOLO qui, dove si stampa.
const onTen = (rating) => (typeof rating === 'number' ? rating * 2 : null);

// ⚠️ Persistente: il voto di un film non cambia in una settimana, e una Map di
// modulo moriva ad ogni ricarica del bundle — cioe' l'utente rivedeva il
// caricamento al focus su titoli gia' visti. Il backend ha la sua cache (3
// giorni), questa toglie anche il giro di rete.
const cache = new PersistentCache('letterboxd', { ttlMs: 3 * 24 * 60 * 60 * 1000, maxEntries: 500 });
const inflight = new Map();

// `loaded` distingue "non ancora chiesto" da "chiesto e non c'e'": senza,
// il chip lampeggerebbe (stesso inciampo della riga "Disponibile dal").
const NONE = { rating: null, rating10: null, slug: null, loaded: false };

const fetchRating = async (imdbId) => {
    const r = await fetch(`${BACKEND_URL}/letterboxd/${encodeURIComponent(imdbId)}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || typeof j !== 'object') return null;
    const rating = typeof j.rating === 'number' ? j.rating : null;
    return {
        rating,
        rating10: onTen(rating),
        slug: typeof j.slug === 'string' ? j.slug : null,
        loaded: true,
    };
};

// Scalda la cache senza montare niente: lo usa il prefetch della home.
const warmLetterboxd = (imdbId) => {
    if (!/^tt\d+$/.test(imdbId || '')) return Promise.resolve(null);
    const hit = cache.get(imdbId);
    if (hit) return Promise.resolve({ ...hit, rating10: onTen(hit.rating), loaded: true });
    const running = inflight.get(imdbId);
    if (running) return running;
    const p = fetchRating(imdbId)
        .then((res) => {
            // ⚠️ Si mette in cache anche il "non c'e' voto" (rating null): senza,
            // ogni film senza Letterboxd verrebbe richiesto ad ogni focus per
            // sempre. Il backend distingue gia' "non lo so" da "non risponde".
            if (res) cache.set(imdbId, { rating: res.rating, slug: res.slug });
            return res;
        })
        .catch(() => null)
        .finally(() => inflight.delete(imdbId));
    inflight.set(imdbId, p);
    return p;
};

const useLetterboxdRating = (type, id) => {
    const [state, setState] = React.useState(NONE);

    React.useEffect(() => {
        setState(NONE);
        if (type !== 'movie' || !id) return;
        const m = String(id).match(/^(tt\d+)/);
        if (!m) return;
        const imdbId = m[1];

        const cached = cache.get(imdbId);
        if (cached) {
            setState({ rating: cached.rating, rating10: onTen(cached.rating), slug: cached.slug, loaded: true });
            return;
        }

        let cancelled = false;
        warmLetterboxd(imdbId).then((res) => {
            if (!cancelled && res) setState(res);
        });
        return () => { cancelled = true; };
    }, [type, id]);

    return state;
};

module.exports = useLetterboxdRating;
module.exports.warmLetterboxd = warmLetterboxd;
