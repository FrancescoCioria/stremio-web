// Copyright (C) 2017-2026 Smart code 203358507
//
// Logica pura dell'auto-setup Casa (login + streaming server URL). Il pezzo che
// parla col core sta in src/App/CasaAutoSetup.js; qui c'e' solo cio' che si puo'
// testare senza browser ne' core.

const STREAMING_SERVER_PORT = 11470;

// `localhost` NON viene normalizzato a se stesso di proposito:
//  - il default di Stremio (e quello che la tile ha gia' in localStorage) e'
//    `http://127.0.0.1:11470/`: scriverne uno diverso ma equivalente sarebbe una
//    riscrittura inutile delle settings ad ogni avvio;
//  - `localhost` puo' risolvere a `::1` per primo, e lo streaming server ascolta
//    su IPv4 -> URL sintatticamente giusto e connessione rifiutata.
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

// URL dello streaming server per la pagina che sta girando ORA: stesso host
// della pagina, porta 11470. Stessa regola di casaBackend.js e per lo stesso
// motivo: sulla TV la pagina e' localhost, dal Mac remoto e' `stremio.casa` /
// `beelink-cachyos` / l'IP Tailscale, e un loopback hardcoded manderebbe il
// player a cercare uno streaming server SUL MAC, dove non c'e' nessuno.
const streamingServerUrlForHost = (hostname) => {
    const host = String(hostname || '');
    const target = LOOPBACK_HOSTS.includes(host) ? '127.0.0.1' : host;
    return 'http://' + target + ':' + STREAMING_SERVER_PORT + '/';
};

// Confronto tollerante allo slash finale: il core salva `.../` , la UI di
// Settings accetta anche senza. Due stringhe diverse che sono lo stesso server
// non devono produrre una riscrittura (e un toast) ad ogni avvio.
const sameServerUrl = (a, b) => {
    const norm = (u) => (typeof u === 'string' ? u.trim().replace(/\/+$/, '') : null);
    const na = norm(a);
    return na !== null && na === norm(b);
};

// L'URL da scrivere, o null se quello corrente va gia' bene.
const serverUrlUpdate = (settings, hostname) => {
    const target = streamingServerUrlForHost(hostname);
    const current = settings && settings.streamingServerUrl;
    return sameServerUrl(current, target) ? null : target;
};

module.exports = {
    STREAMING_SERVER_PORT,
    streamingServerUrlForHost,
    sameServerUrl,
    serverUrlUpdate,
};
