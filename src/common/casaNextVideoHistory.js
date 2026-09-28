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
// Caso SENZA deep link al player (il successivo non ha uno stream noto): si
// sostituisce il player con la pagina torrent del successivo, e la voce sotto
// resta quella di E07 — scavalcata all'uscita come sotto.

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

// ⚠️ La pagina torrent del PRECEDENTE resta comunque sotto (una voce che non e'
// la corrente non si riscrive): home -> episodi -> torrent E01 -> torrent E02 ->
// player E02 (session history reale, The Bear 28/09/2026: un "indietro" in piu'
// per tornare a home, e passando da E01). La si salta all'uscita: da una pagina
// torrent, "indietro" scavalca le pagine torrent della STESSA serie subito sotto.
// Fuori da questa catena due pagine torrent della stessa serie non stanno mai
// una sull'altra (cambiare episodio dalla pagina fa `replace`).

// Pagina torrent = /detail/<type>/<id>/<videoId>: torna "<type>/<id>" o null.
const torrentPageSeries = (url) => {
    if (typeof url !== 'string') return null;
    const hash = url.indexOf('#');
    const path = (hash >= 0 ? url.slice(hash + 1) : url).split('?')[0];
    const m = path.match(/^\/(?:detail|metadetails)\/([^/]+)\/([^/]+)\/([^/]+)\/?$/);
    return m ? m[1] + '/' + m[2] : null;
};

// urls = URL delle voci di history (navigation.entries()), index = la corrente.
// Quante voci saltare IN PIU' tornando indietro da qui (0 = back normale).
// Con la Navigation API (Firefox >= 147): le voci vere di window.navigation.
// Senza, o con un "indietro" ancora in corso (secondo tasto premuto rapido: il
// calcolo partirebbe dalla posizione vecchia), 0 = back normale.
const casaBackSkip = () => {
    const nav = typeof window !== 'undefined' ? window.navigation : null;
    if (!nav || typeof nav.entries !== 'function' || !nav.currentEntry || nav.transition) return 0;
    return supersededTorrentPagesBelow(nav.entries().map((e) => e.url), nav.currentEntry.index);
};

const supersededTorrentPagesBelow = (urls, index) => {
    if (!Array.isArray(urls) || !Number.isInteger(index) || index < 1 || index >= urls.length) return 0;
    const series = torrentPageSeries(urls[index]);
    if (series === null) return 0;
    let skip = 0;
    // `i > 0`: la voce piu' in basso non si salta mai (back deve atterrare da qualche parte).
    for (let i = index - 1; i > 0 && torrentPageSeries(urls[i]) === series; i--) skip++;
    return skip;
};

module.exports = { nextVideoNavigation, supersededTorrentPagesBelow, casaBackSkip };
