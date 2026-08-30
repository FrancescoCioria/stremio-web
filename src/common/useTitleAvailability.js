// Copyright (C) 2017-2026 Smart code 203358507

const React = require('react');
const { casaBackendUrl } = require('./casaBackend');
const { PersistentCache } = require('./casaPersistentCache');

// Hook: due segnali per un titolo (film o serie), dal launcher-backend
// /availability/:type/:imdbId (TMDB-backed, vedi availability.ts):
//   inCinema -> film ancora SOLO al cinema (mai true per le serie)
//   onPrime  -> incluso GRATIS su Amazon Prime Video IT (flatrate/ads/free)
// Serve a sapere "se i torrent fanno storie, dove lo guardo subito".
// Default { false, false } (fail-safe: nessuna pill su dati incompleti).

// Backend co-locato con la pagina: la regola "host dalla pagina, mai loopback"
// vive in casaBackend.js (un solo punto per tutti i chiamanti).
const BACKEND_URL = casaBackendUrl('');

// ⚠️ Persistente (vedi casaPersistentCache.js): erano dati ri-scaricati ad ogni
// ricarica del bundle. TTL corto rispetto agli altri: "al cinema" e "su Prime"
// cambiano davvero, e una pill sbagliata e' peggio di una pill assente.
const cache = new PersistentCache('availability', { ttlMs: 24 * 60 * 60 * 1000, maxEntries: 500 });
const inflight = new Map(); // imdbId -> Promise

// loaded=false finche' la risposta backend non e' arrivata: serve a NON
// mostrare label/pill dedotte dall'assenza di dati mentre stiamo ancora
// caricando. Senza, la riga "Disponibile: data non nota" (che nasce proprio
// dall'assenza di digitalRelease) LAMPEGGIAVA sul dettaglio film appena il
// metaItem diventava Ready ma prima che /availability rispondesse, poi
// spariva col dato vero (2026-07-17).
const NONE = { inCinema: false, onPrime: false, digitalRelease: null, loaded: false };

const fetchAvailability = async (kind, imdbId) => {
    const r = await fetch(`${BACKEND_URL}/availability/${kind}/${encodeURIComponent(imdbId)}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || typeof j !== 'object') return null;
    return {
        inCinema: j.in_cinema === true,
        onPrime: j.on_prime === true,
        // ISO date della prima uscita digitale (o null). La riga "Digitale: ..."
        // sul dettaglio film deriva recenza/wording da casaDigitalRelease.js.
        digitalRelease: typeof j.digital_release_date === 'string' ? j.digital_release_date : null,
        loaded: true,
    };
};

// Scalda la cache senza montare niente: lo usa il prefetch della home.
const warmAvailability = (kind, imdbId) => {
    if (!kind || !/^tt\d+$/.test(imdbId || '')) return Promise.resolve(null);
    const hit = cache.get(imdbId);
    if (hit) return Promise.resolve(hit);
    const running = inflight.get(imdbId);
    if (running) return running;
    const p = fetchAvailability(kind, imdbId)
        .then((res) => {
            if (res) cache.set(imdbId, res);
            return res;
        })
        .catch(() => null)
        .finally(() => inflight.delete(imdbId));
    inflight.set(imdbId, p);
    return p;
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

        const cached = cache.get(imdbId);
        if (cached) {
            setState({ ...cached, loaded: true });
            return;
        }

        let cancelled = false;
        warmAvailability(kind, imdbId).then((res) => {
            if (!cancelled && res) setState(res);
        });
        return () => { cancelled = true; };
    }, [type, id]);

    return state;
};

module.exports = useTitleAvailability;
module.exports.warmAvailability = warmAvailability;
