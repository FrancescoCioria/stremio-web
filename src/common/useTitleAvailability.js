// Copyright (C) 2017-2026 Smart code 203358507

const React = require('react');

// Hook: due segnali per un titolo (film o serie), dal launcher-backend
// /availability/:type/:imdbId (TMDB-backed, vedi availability.ts):
//   inCinema -> film ancora SOLO al cinema (mai true per le serie)
//   onPrime  -> incluso GRATIS su Amazon Prime Video IT (flatrate/ads/free)
// Serve a sapere "se i torrent fanno storie, dove lo guardo subito".
// Default { false, false } (fail-safe: nessuna pill su dati incompleti).

// Backend co-locato con la pagina (stremio-web servito dal Beelink su :8080,
// launcher-backend su :8765 stesso host). Deriviamo l'host DALLA PAGINA cosi'
// la pill funziona sia in locale sulla TV (localhost:8080 -> localhost:8765)
// sia da remoto via Tailscale (stremio.casa / beelink-cachyos:8080 -> :8765)
// senza hardcode. http esplicito: il backend e' solo HTTP (la pagina e' HTTP).
const BACKEND_URL = `http://${window.location.hostname}:8765`;

const cache = new Map(); // imdbId -> { inCinema, onPrime, ts }
const inflight = new Map(); // imdbId -> Promise
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 500;

const NONE = { inCinema: false, onPrime: false };

const fetchAvailability = async (kind, imdbId) => {
    const r = await fetch(`${BACKEND_URL}/availability/${kind}/${encodeURIComponent(imdbId)}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || typeof j !== 'object') return null;
    return {
        inCinema: j.in_cinema === true,
        onPrime: j.on_prime === true,
    };
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

const putCache = (imdbId, res) => {
    cache.set(imdbId, { ...res, ts: Date.now() });
    if (cache.size > MAX_CACHE) {
        const oldest = cache.keys().next().value;
        cache.delete(oldest);
    }
};

const useTitleAvailability = (type, id) => {
    const [state, setState] = React.useState(NONE);

    React.useEffect(() => {
        setState(NONE);
        const kind = type === 'movie' ? 'movie' : type === 'series' ? 'series' : null;
        if (!kind || !id) return;
        const m = String(id).match(/^(tt\d+)/);
        if (!m) return;
        const imdbId = m[1];

        const cached = getCached(imdbId);
        if (cached) {
            setState({ inCinema: cached.inCinema, onPrime: cached.onPrime });
            return;
        }

        let cancelled = false;
        let p = inflight.get(imdbId);
        if (!p) {
            p = fetchAvailability(kind, imdbId)
                .then((res) => {
                    if (res) putCache(imdbId, res);
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

module.exports = useTitleAvailability;
