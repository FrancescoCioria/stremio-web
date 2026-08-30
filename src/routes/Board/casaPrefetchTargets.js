// Copyright (C) 2017-2026 Smart code 203358507
//
// Cosa scaldare, dato lo stato delle righe della home. Pura: niente React,
// niente rete — il test la esercita da sola. Vedi useCasaPrefetch.js.

// `tt12345:1:1` -> `tt12345`; scarta gli id non IMDb (nessuno dei tre servizi
// li sa gestire).
const imdbOf = (id) => {
    const m = id ? String(id).match(/^(tt\d+)/) : null;
    return m ? m[1] : null;
};

// Estrae la lista da scaldare dai cataloghi visibili. Pura: il test la esercita
// senza React ne' rete.
const prefetchTargets = (catalogs, headPerRow) => {
    const out = [];
    const seen = new Set();
    for (const catalog of catalogs ?? []) {
        const items = catalog?.content?.type === 'Ready' ? catalog.content.content : [];
        for (const item of items.slice(0, headPerRow)) {
            const id = item?.id ?? item?._id;
            const imdb = imdbOf(id);
            const type = item?.type;
            if (!imdb || !type) continue;
            const key = `${type}:${imdb}`;
            // ⚠️ Dedup fra righe: lo stesso titolo sta spesso in piu' righe
            // (Continue Watching + Ultime uscite), e scaldarlo due volte
            // sarebbe traffico buttato.
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ type, imdb, id });
        }
    }
    return out;
};

module.exports = { prefetchTargets, imdbOf };
