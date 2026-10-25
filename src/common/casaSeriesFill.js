// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: campi della SCHEDA serie che Cinemeta non ha, presi da TMDB (backend,
// `meta` di `/stremio-addon/extra-videos`, fonte unica series_tmdb.ts).
// Puro, testabile (tests/casaSeriesFill.spec.js).
//
// Caso che l'ha prodotto (2026-10-25): "Nord Sud Ovest Est: La leggendaria
// storia degli 883", scheda Cinemeta grezza (da IMDb) senza trama, sfondo,
// poster ne' nome: pagina scura con un buco al posto della trama.
//
// Nome, sfondo, logo: si RIEMPIONO, non si sostituiscono (il nome resta
// l'originale di Cinemeta: e' quello dei torrent, e di solito si vede il logo).
// Trama: quella ITALIANA di TMDB vince su quella inglese di Cinemeta (scelta
// utente 25/10/2026; cambiava su 48 serie su 50 della home); senza, Cinemeta.
// ⚠️ Solo per mostrare: a chi scrive nel core (libreria) va il meta del core.
//
// Logo: Cinemeta mette sempre l'indirizzo di metahub, anche quando metahub
// risponde 404 (1 su 50 quel giorno). Quindi il logo TMDB non lo sostituisce:
// e' il RIPIEGO se l'immagine non carica (`fallbackLogo`), prima del titolo
// scritto.

const has = (s) => typeof s === 'string' && s.length > 0;
const FIELDS = ['name', 'description', 'background', 'logo'];
// Campi in cui TMDB vince anche se Cinemeta li ha (la trama in italiano).
const PREFER_TMDB = new Set(['description']);

const fillSeriesMeta = (meta, fill) => {
    if (!meta || !fill) return meta;
    const out = { ...meta };
    let changed = false;
    for (const k of FIELDS) {
        if ((!has(meta[k]) || PREFER_TMDB.has(k)) && has(fill[k]) && fill[k] !== meta[k]) {
            out[k] = fill[k];
            changed = true;
        }
    }
    out.casaFallbackLogo = has(meta.logo) && has(fill.logo) && fill.logo !== meta.logo ? fill.logo : null;
    return changed || out.casaFallbackLogo ? out : meta;
};

module.exports = { fillSeriesMeta };
