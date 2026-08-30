// Copyright (C) 2017-2026 Smart code 203358507

const React = require('react');
const { casaBackendUrl } = require('./casaBackend');

// Hook: voto Letterboxd di un FILM, dal launcher-backend `/letterboxd/:imdbId`
// (vedi letterboxd.ts). Sta accanto a quello IMDb nel dettaglio: sono due
// pubblici diversi e sui film d'animazione danno ordini quasi opposti
// (misurato: Super Mario Galaxy 8,2/10 su TMDB e 2,89/5 su Letterboxd).
//
// ⚠️ SOLO FILM: Letterboxd non ha le serie. Su una serie non si chiede niente e
// non si mostra niente — non e' un dato mancante, e' un dato che non esiste.
const BACKEND_URL = casaBackendUrl('');

const cache = new Map(); // imdbId -> { rating, slug, ts }
const inflight = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 500;

// `loaded` distingue "non ancora chiesto" da "chiesto e non c'e'": senza,
// il chip lampeggerebbe (stesso inciampo della riga "Disponibile dal").
const NONE = { rating: null, slug: null, loaded: false };

const fetchRating = async (imdbId) => {
    const r = await fetch(`${BACKEND_URL}/letterboxd/${encodeURIComponent(imdbId)}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || typeof j !== 'object') return null;
    return {
        rating: typeof j.rating === 'number' ? j.rating : null,
        slug: typeof j.slug === 'string' ? j.slug : null,
        loaded: true,
    };
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
        if (cached && Date.now() - cached.ts <= TTL_MS) {
            setState({ rating: cached.rating, slug: cached.slug, loaded: true });
            return;
        }

        let cancelled = false;
        let p = inflight.get(imdbId);
        if (!p) {
            p = fetchRating(imdbId)
                .then((res) => {
                    if (res) {
                        cache.set(imdbId, { ...res, ts: Date.now() });
                        if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
                    }
                    return res;
                })
                .catch(() => null)
                .finally(() => inflight.delete(imdbId));
            inflight.set(imdbId, p);
        }
        p.then((res) => {
            if (!cancelled && res) setState(res);
        });
        return () => { cancelled = true; };
    }, [type, id]);

    return state;
};

module.exports = useLetterboxdRating;
