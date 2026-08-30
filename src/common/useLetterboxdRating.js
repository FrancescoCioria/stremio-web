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
const NONE = { rating: null, rating10: null, slug: null, imdb: null, rt: null, metacritic: null, loaded: false };

// ⚠️ Una chiamata sola per i DUE voti: `/ratings/:imdbId`. Il voto IMDb NON
// arriva da Cinemeta — che sui titoli nuovi e' indietro di settimane (misurato:
// 4 film su 7 della riga "Ultime uscite" senza voto li' e con voto su IMDb) — ma
// dal dataset ufficiale IMDb che il backend tiene aggiornato.
const fetchRating = async (imdbId) => {
    const r = await fetch(`${BACKEND_URL}/ratings/${encodeURIComponent(imdbId)}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || typeof j !== 'object') return null;
    const lb = j.letterboxd || {};
    const rating = typeof lb.rating === 'number' ? lb.rating : null;
    const imdb = j.imdb && typeof j.imdb.rating === 'number' ? j.imdb.rating : null;
    return {
        rating,
        rating10: onTen(rating),
        slug: typeof lb.slug === 'string' ? lb.slug : null,
        imdb,
        // ⚠️ Rotten Tomatoes e Metacritic ci sono di rado (misurato sulla riga
        // "Ultime uscite": 6% e 33%). Si mostrano quando ci sono; NON ordinano
        // niente, per lo stesso motivo.
        rt: typeof j.rt === 'number' ? j.rt : null,
        metacritic: typeof j.metacritic === 'number' ? j.metacritic : null,
        loaded: true,
    };
};

// Scalda la cache senza montare niente: lo usa il prefetch della home.
const warmLetterboxd = (imdbId) => {
    if (!/^tt\d+$/.test(imdbId || '')) return Promise.resolve(null);
    const hit = cache.get(imdbId);
    if (hit) return Promise.resolve({ ...NONE, ...hit, rating10: onTen(hit.rating), loaded: true });
    const running = inflight.get(imdbId);
    if (running) return running;
    const p = fetchRating(imdbId)
        .then((res) => {
            // ⚠️ Si mette in cache anche il "non c'e' voto" (rating null): senza,
            // ogni film senza Letterboxd verrebbe richiesto ad ogni focus per
            // sempre. Il backend distingue gia' "non lo so" da "non risponde".
            if (res) cache.set(imdbId, { rating: res.rating, slug: res.slug, imdb: res.imdb, rt: res.rt, metacritic: res.metacritic });
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
        // ⚠️ Non piu' solo film: Letterboxd non ha le serie, ma il voto IMDb si'
        // — ed e' proprio sulle serie nuove che Cinemeta manca piu' spesso.
        if (!type || !id) return;
        const m = String(id).match(/^(tt\d+)/);
        if (!m) return;
        const imdbId = m[1];

        const cached = cache.get(imdbId);
        if (cached) {
            setState({ ...NONE, ...cached, rating10: onTen(cached.rating), loaded: true });
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
