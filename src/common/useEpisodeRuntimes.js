// Copyright (C) 2017-2026 Smart code 203358507

const React = require('react');
const { casaBackendUrl } = require('./casaBackend');

// Hook: durate reali degli episodi di UNA stagione, dal launcher-backend
// /episode-runtimes/:imdbId/:season (TMDB-backed, vedi episode_runtimes.ts).
// Ritorna { season, runtimes: { "<numero episodio>": minuti } }.
//
// `season` dice A QUALE stagione appartiene la mappa: l'effect che rifetcha gira
// DOPO il paint, quindi al cambio stagione esiste un render in cui `previewVideo`
// e' gia' S02E03 ma lo state e' ancora la mappa della S01 -> senza questo campo
// il chiamante mostrerebbe la durata di S01E03 sotto l'etichetta S02E03 (numeri
// entrambi plausibili = errore invisibile). Il chiamante confronta e scarta.
//
// Cinemeta NON ha la durata per-episodio: il `runtime` del meta e' quello
// nominale della serie (uguale per tutti gli episodi, spesso lontano dal vero:
// The Last of Us dichiara 56 min, gli episodi vanno da 46 a 81).

const cache = new Map(); // `${imdbId}:${season}` -> { runtimes, ts }
const inflight = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 200;

const NONE = { season: null, runtimes: {} };

const fetchRuntimes = async (imdbId, season) => {
    // URL derivato al call-time (mai costante di modulo): vedi casaBackend.js.
    const r = await fetch(`${casaBackendUrl('')}/episode-runtimes/${encodeURIComponent(imdbId)}/${season}`);
    if (!r.ok) return null;
    const j = await r.json();
    // null (serie non su TMDB) -> {} cachato: non ri-chiedere ad ogni focus.
    return j && typeof j === 'object' ? j : {};
};

const getCached = (key) => {
    const c = cache.get(key);
    if (!c) return null;
    if (Date.now() - c.ts > TTL_MS) {
        cache.delete(key);
        return null;
    }
    return c.runtimes;
};

const putCache = (key, runtimes) => {
    cache.set(key, { runtimes, ts: Date.now() });
    if (cache.size > MAX_CACHE) {
        cache.delete(cache.keys().next().value);
    }
};

const useEpisodeRuntimes = (type, id, season) => {
    const [state, setState] = React.useState(NONE);

    React.useEffect(() => {
        setState(NONE);
        if (type !== 'series' || !id || !Number.isInteger(season) || season < 0) return;
        const m = String(id).match(/^(tt\d+)/);
        if (!m) return;
        const imdbId = m[1];
        const key = `${imdbId}:${season}`;

        const cached = getCached(key);
        if (cached) {
            setState({ season, runtimes: cached });
            return;
        }

        let cancelled = false;
        let p = inflight.get(key);
        if (!p) {
            p = fetchRuntimes(imdbId, season)
                .then((res) => {
                    if (res) putCache(key, res);
                    return res;
                })
                .catch(() => null)
                .finally(() => inflight.delete(key));
            inflight.set(key, p);
        }
        p.then((res) => {
            if (!cancelled && res) setState({ season, runtimes: res });
        });
        return () => { cancelled = true; };
    }, [type, id, season]);

    return state;
};

module.exports = useEpisodeRuntimes;
