// Copyright (C) 2017-2026 Smart code 203358507

const React = require('react');

// Hook: ritorna true se il film e' ancora SOLO al cinema. Fonte:
// launcher-backend /availability/movie/:imdbId (TMDB-backed, vedi
// availability.ts). Default false (fail-safe: mai falso "Al Cinema").

const BACKEND_URL = 'http://localhost:8765';

const cache = new Map(); // imdbId -> { inCinema: boolean, ts: number }
const inflight = new Map(); // imdbId -> Promise
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 500;

const fetchAvailability = async (imdbId) => {
    const r = await fetch(`${BACKEND_URL}/availability/movie/${encodeURIComponent(imdbId)}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || typeof j !== 'object' || typeof j.in_cinema !== 'boolean') return null;
    return { inCinema: j.in_cinema };
};

const getCached = (imdbId) => {
    const c = cache.get(imdbId);
    if (!c) return null;
    if (Date.now() - c.ts > TTL_MS) {
        cache.delete(imdbId);
        return null;
    }
    return c;
};

const putCache = (imdbId, inCinema) => {
    cache.set(imdbId, { inCinema, ts: Date.now() });
    if (cache.size > MAX_CACHE) {
        const oldest = cache.keys().next().value;
        cache.delete(oldest);
    }
};

const useMovieAvailability = (type, id) => {
    const [inCinema, setInCinema] = React.useState(false);

    React.useEffect(() => {
        setInCinema(false);
        if (type !== 'movie' || !id) return;
        const m = String(id).match(/^(tt\d+)/);
        if (!m) return;
        const imdbId = m[1];

        const cached = getCached(imdbId);
        if (cached) {
            setInCinema(cached.inCinema);
            return;
        }

        let cancelled = false;
        let p = inflight.get(imdbId);
        if (!p) {
            p = fetchAvailability(imdbId)
                .then((res) => {
                    if (res) putCache(imdbId, res.inCinema);
                    return res;
                })
                .catch(() => null)
                .finally(() => inflight.delete(imdbId));
            inflight.set(imdbId, p);
        }
        p.then((res) => {
            if (!cancelled && res) setInCinema(res.inCinema);
        });
        return () => { cancelled = true; };
    }, [type, id]);

    return inCinema;
};

module.exports = useMovieAvailability;
