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
// ⚠️ Si RIEMPIE, non si sostituisce: un campo che Cinemeta ha resta il suo.
// Misurato quel giorno sulle 50 serie della home: trama, sfondo e nome c'erano
// su tutte, quindi per loro la pagina esce identica. Il passaggio ai testi
// italiani di TMDB AL POSTO di quelli inglesi e' un'altra decisione.
// ⚠️ Solo per mostrare: a chi scrive nel core (libreria) va il meta del core.
//
// Logo: Cinemeta mette sempre l'indirizzo di metahub, anche quando metahub
// risponde 404 (1 su 50 quel giorno). Quindi il logo TMDB non lo sostituisce:
// e' il RIPIEGO se l'immagine non carica (`fallbackLogo`), prima del titolo
// scritto.

const has = (s) => typeof s === 'string' && s.length > 0;
const FIELDS = ['name', 'description', 'background', 'logo'];

const fillSeriesMeta = (meta, fill) => {
    if (!meta || !fill) return meta;
    const out = { ...meta };
    let changed = false;
    for (const k of FIELDS) {
        if (!has(meta[k]) && has(fill[k])) {
            out[k] = fill[k];
            changed = true;
        }
    }
    out.casaFallbackLogo = has(meta.logo) && has(fill.logo) && fill.logo !== meta.logo ? fill.logo : null;
    return changed || out.casaFallbackLogo ? out : meta;
};

module.exports = { fillSeriesMeta };
