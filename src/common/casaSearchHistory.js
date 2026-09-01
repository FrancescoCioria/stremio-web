// Copyright (C) 2017-2026 Smart code 203358507

// Casa: la cronologia di ricerca si filtra su quello che si sta scrivendo.
//
// ⚠️ Il difetto che risolve: la barra mostrava SEMPRE le ultime 8 ricerche in
// cima al menu, sopra i suggerimenti veri. Scrivendo "ghost in the" le prime
// sei righe erano "Toy Story", "the witness", "avatar aang"... — cioe' le
// righe piu' vicine al dito e alla freccia giu' erano quelle che non
// c'entravano niente, e i risultati pertinenti finivano sotto la piega.
//
// Regola: a campo VUOTO la cronologia e' tutta (e' il suo momento: ripescare
// una ricerca di ieri senza riscriverla); appena si scrive, restano solo le
// voci compatibili con il testo, e se non ne resta nessuna la sezione sparisce
// invece di occupare il menu.

// Confronto tollerante: minuscole, accenti via, punteggiatura come spazio.
// "Pokemon" deve trovare "Pokémon", "spider-man" deve trovare "Spider Man".
const normalize = (text) => String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Una voce e' compatibile se contiene la query cosi' com'e' (frase parziale,
// "ghost in the" -> "Ghost in the Shell") oppure, in mancanza, se contiene
// TUTTE le parole scritte (ordine libero: "shell ghost" trova lo stesso film).
const matchesQuery = (candidate, query) => {
    const haystack = normalize(candidate);
    const needle = normalize(query);
    if (needle.length === 0) return true;
    if (haystack.length === 0) return false;
    if (haystack.includes(needle)) return true;
    return needle.split(' ').every((word) => haystack.includes(word));
};

// items: la cronologia del core (piu' recente prima). Torna la stessa lista
// filtrata e tagliata, senza riordinarla: l'ordine cronologico e' l'unica
// informazione che l'utente ha su quelle righe.
const filterSearchHistory = (items, query, limit = 8) => {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => matchesQuery(item?.query, query)).slice(0, limit);
};

module.exports = { filterSearchHistory, matchesQuery, normalize };
