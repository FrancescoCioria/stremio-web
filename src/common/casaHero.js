// Copyright (C) 2017-2026 Smart code 203358507

// Tutto cio' che l'hero della home mostra di un titolo (campi Cinemeta, voti,
// disponibilita'), dal backend (`hero.ts`).
//
// ⚠️ Prima la tile chiedeva queste cose AL FOCUS: Cinemeta direttamente (p90
// 1,7-2,2 s, punte di 6,5 s, misurato dal Beelink il 2026-10-10) piu' due
// chiamate al backend, con cache in localStorage piu' piccole della home (~400
// titoli contro 400 voci: si svuotavano da sole). Ora all'apertura della home
// parte UNA richiesta con tutti i titoli delle righe; il backend tiene la
// cache in SQLite. Al focus il dato c'e' gia'.
//
// Solo memoria: la richiesta va al backend di casa (localhost sulla TV), a
// ogni ricarica del bundle si rifa' in un colpo. Niente quota da gestire.

const { casaBackendUrl } = require('./casaBackend');
const { parseRatings, NONE: NO_RATINGS } = require('./useLetterboxdRating');
const { parseAvailability, NONE: NO_AVAILABILITY } = require('./useTitleAvailability');

// `movie:tt123` -> { hero: { meta, ratings, availability }, at }
const heroes = new Map();
// Oltre questo un dato si RICHIEDE (al prossimo giro o focus), ma intanto si
// mostra: la tile resta aperta per giorni e "Al cinema" o un voto cambiano
// (la cache di disponibilita' che c'era prima durava 24 h).
const STALE_MS = 6 * 60 * 60 * 1000;
const inflight = new Map();
// Titoli gia' dentro una richiesta in blocco ancora aperta (fino a 4 s lato
// backend): la riga che arriva nel frattempo non li richiede di nuovo.
const bulkPending = new Set();
const listeners = new Set();

// `tt12345:1:1` (episodio di Continua a guardare) -> `tt12345`, come il backend.
const keyOf = (type, id) => {
    const m = id ? String(id).match(/^(tt\d+)/) : null;
    return (type === 'movie' || type === 'series') && m ? `${type}:${m[1]}` : null;
};

const isFresh = (key) => {
    const e = heroes.get(key);
    return !!e && Date.now() - e.at < STALE_MS;
};

// Risposta del backend -> forma che l'hero legge. I due sotto-oggetti passano
// dagli STESSI parser dei loro hook: una forma sola.
// ⚠️ `meta: null` = Cinemeta non ha risposto e il backend non ha cache: NON si
// tiene (null), cosi' il titolo si richiede al prossimo focus/giro invece di
// restare "senza scheda" per tutta la sessione.
const parseHero = (j) => {
    if (!j || typeof j !== 'object' || !j.meta || typeof j.meta !== 'object') return null;
    return {
        meta: j.meta,
        ratings: parseRatings(j.ratings) || { ...NO_RATINGS, loaded: true },
        // null dal backend = titolo non in TMDB: un fatto, non "sto caricando".
        availability: parseAvailability(j.availability) || { ...NO_AVAILABILITY, loaded: true },
    };
};

const notify = () => {
    for (const fn of listeners) {
        try { fn(); } catch (_e) { /* un ascoltatore rotto non ferma gli altri */ }
    }
};

const store = (entries) => {
    let changed = false;
    for (const [key, raw] of entries) {
        const hero = parseHero(raw);
        if (!hero) continue;
        heroes.set(key, { hero, at: Date.now() });
        changed = true;
    }
    if (changed) notify();
};

// Stesso oggetto finche' non arriva un dato nuovo: e' lo snapshot di
// `useSyncExternalStore` (BoardHero), che ridisegna solo se cambia.
const getHero = (type, id) => {
    const key = keyOf(type, id);
    const e = key ? heroes.get(key) : null;
    return e ? e.hero : null;
};

// Un titolo solo: il ripiego quando l'utente arriva su una card prima che la
// richiesta in blocco l'abbia portata (Continua a guardare appena cambiato,
// titolo lento lato backend). null = niente da chiedere (fresco, o id non IMDb).
const fetchHero = (type, id) => {
    const key = keyOf(type, id);
    if (!key || isFresh(key)) return null;
    const running = inflight.get(key);
    if (running) return running;
    const [kind, imdb] = key.split(':');
    const p = fetch(casaBackendUrl(`/stremio-addon/hero/${kind}/${imdb}`))
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => store([[key, j]]))
        .catch(() => null)
        .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
};

// Cosa chiedere in blocco: tipo noto, id IMDb, niente doppioni, solo i titoli
// che mancano o sono vecchi. Pura a parte lo stato del modulo.
const missingItems = (items) => {
    const out = [];
    const seen = new Set();
    for (const it of items || []) {
        const key = keyOf(it && it.type, it && (it.id || it._id));
        if (!key || seen.has(key) || bulkPending.has(key) || isFresh(key)) continue;
        seen.add(key);
        out.push({ key, type: it.type, id: it.id || it._id });
    }
    return out;
};

// Tutti i titoli delle righe, in una richiesta. Le righe arrivano a pezzi (il
// core le carica una alla volta) e ogni pezzo rilancia: si chiede solo cio'
// che manca.
const loadHeroes = async (items) => {
    const missing = missingItems(items);
    const url = casaBackendUrl('/stremio-addon/hero');
    if (missing.length === 0 || !url) return;
    for (const m of missing) bulkPending.add(m.key);
    try {
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: missing.map(({ type, id }) => ({ type, id })) }),
        });
        const j = r.ok ? await r.json() : null;
        store(Object.entries((j && j.heroes) || {}));
    } finally {
        for (const m of missing) bulkPending.delete(m.key);
    }
};

// L'hero a fuoco si ridisegna quando il dato arriva DOPO il focus (prima
// apertura della home, o una card su cui si e' gia' fermi).
const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};

module.exports = { getHero, fetchHero, loadHeroes, subscribe, keyOf, missingItems };
