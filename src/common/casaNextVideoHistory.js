// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: "episodio successivo" e la HISTORY del browser.
//
// Il caso reale (Silo, 14/09/2026): Continue Watching apre E07 (history seminata
// da LibItem: home -> episodi -> torrent E07 -> player E07), l'utente preme
// "episodio successivo", poi vuole cambiare torrent e preme indietro: finisce
// sui torrent di E07, non di E08.
//
// Upstream navigava al player del successivo con `replace`: la voce del player
// E07 diventava player E08, ma quella SOTTO restava la pagina torrent di E07.
// Adesso la voce del player diventa la pagina torrent del SUCCESSIVO e il suo
// player si apre sopra: indietro porta ai torrent di E08.
//
// ⚠️ La pagina torrent si scrive con un replaceState RAW (invisibile al router)
// e il player si apre assegnando `window.location`: e' lo stesso schema di
// LibItem. Con due `navigate()` il router renderebbe anche la pagina torrent,
// e con "Auto" attivo quella fa partire da sola una race.
//
// Resta com'era il caso SENZA deep link al player (il successivo non ha uno
// stream noto): si sostituisce il player con la pagina torrent del successivo,
// e la voce sotto e' ancora quella di E07. Correggerla vorrebbe dire tornare
// indietro nella history e riscriverla in modo asincrono.

const nextVideoNavigation = (deepLinks, bingeWatching, ended) => {
    if (ended && !bingeWatching) return { kind: 'back' };
    const dl = deepLinks || {};
    const player = typeof dl.player === 'string' ? dl.player : null;
    const streams = typeof dl.metaDetailsStreams === 'string' ? dl.metaDetailsStreams : null;
    if (player && streams) return { kind: 'streams-then-player', streams, player };
    if (player) return { kind: 'replace', url: player };
    if (streams) return { kind: 'replace', url: streams };
    return { kind: 'none' };
};

module.exports = { nextVideoNavigation };
