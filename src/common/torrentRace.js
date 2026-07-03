// Copyright (C) 2017-2023 Smart code 203358507
//
// Motore "Auto": data una lista di stream torrent candidati (gia' filtrati per
// qualita' + ordinati per seeder), li avvia IN PARALLELO sullo streaming-server
// locale (:11470), polla la salute REALE dello swarm (stats.json) e ritorna il
// primo che produce byte (time-to-first-byte). I perdenti vengono rimossi.
//
// Perche' in-browser e non nel backend: il player carica il torrent DALLO STESSO
// streaming-server; scaldando qui i torrent, quando navighiamo al player il
// vincitore sta gia' scaricando e parte istantaneo. Vedi docs/stremio-server-tuning.md
// ("IL COLLO NON E' LA BANDA": il collo e' lo swarm del singolo torrent, quindi
// racing in parallelo su swarm disgiunti NON si ruba banda a vicenda).
//
// FAIL-OPEN TOTALE: server irraggiungibile / fetch in errore / nessun candidato
// pronto -> ritorna il candidato piu' seedato senza bloccare nulla. Il "peggio"
// che puo' succedere e' comportarsi come un click manuale sul primo stream.

const RACE_K = 4; // max candidati messi in parallelo
const POLL_MS = 700; // intervallo di polling stats.json
const RACE_MS = 8000; // finestra massima di race prima del timeout
const UNREACHABLE_MS = 1500; // se dopo questo nessuno ha MAI risposto -> server giu' -> fail-open
const READY_BYTES = 2 * 1024 * 1024; // 2MB scaricati = testa/moov pronti -> giocabile
const FAST_SPEED = 2 * 1024 * 1024; // >=2MB/s = swarm palesemente veloce -> vincitore anticipato
const ALIVE_SPEED = 120 * 1024; // >=120KB/s con peer = "vivo" (per il ranking a timeout)

// Normalizza la base URL dello streaming-server (niente slash finale).
const normServer = (url) => (typeof url === 'string' && url ? url.replace(/\/+$/, '') : null);

// Sorgenti peer per il create: gli stream portano sources tipo
// ["tracker:udp://...", "dht:..."]; le passiamo com'e' + garantiamo il dht dell'infohash.
const buildSources = (stream, infoHash) => {
    const raw = Array.isArray(stream.sources) ? stream.sources.filter((s) => typeof s === 'string') : [];
    const out = raw.filter((s) => s.indexOf('tracker:') === 0 || s.indexOf('dht:') === 0);
    const dht = 'dht:' + infoHash;
    if (out.indexOf(dht) === -1) out.push(dht);
    return out;
};

const fetchJson = (url, opts, timeoutMs) => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs || 4000);
    return fetch(url, Object.assign({ signal: ctrl.signal }, opts))
        .then((r) => (r && r.ok ? r.json() : null))
        .catch(() => null)
        .then((v) => { clearTimeout(to); return v; });
};

// Avvia (o ri-avvia) un torrent sul server iniettando le sorgenti peer reali.
const createTorrent = (server, infoHash, fileIdx, sources) => {
    const body = {
        torrent: { infoHash },
        peerSearch: { sources, min: 40, max: 200 },
        // guessFileIdx: oggetto (lascia scegliere al motore) se non sappiamo l'indice,
        // false se lo conosciamo (l'addon di solito lo fornisce per i film).
        guessFileIdx: typeof fileIdx === 'number' ? false : {}
    };
    return fetchJson(server + '/' + encodeURIComponent(infoHash) + '/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    }, 5000);
};

// stats.json per (infoHash, fileIdx). Se fileIdx e' ignoto usa lo stats a livello
// torrent (che espone comunque downloaded/peers/downloadSpeed globali).
const statsOf = (server, infoHash, fileIdx) => {
    const idx = typeof fileIdx === 'number' ? '/' + encodeURIComponent(fileIdx) : '';
    return fetchJson(server + '/' + encodeURIComponent(infoHash) + idx + '/stats.json', undefined, 4000);
};

// Rimuove un torrent dal server (libera connessioni/slot dei perdenti). Best-effort.
const removeTorrent = (server, infoHash) => {
    try {
        fetch(server + '/' + encodeURIComponent(infoHash) + '/remove').catch(() => undefined);
    } catch (_e) { /* best-effort */ }
};

// Un candidato "vince" appena e' chiaramente pronto: testa scaricata, oppure swarm
// palesemente veloce (byte in arrivo forte). Ritorna true/false.
const isReady = (s) => {
    if (!s) return false;
    const downloaded = +s.downloaded || 0;
    const speed = +s.downloadSpeed || 0;
    const unchoked = +s.unchoked || 0;
    if (downloaded >= READY_BYTES) return true;
    if (unchoked > 0 && speed >= FAST_SPEED) return true;
    return false;
};

// Punteggio per il ranking a TIMEOUT (nessuno "pronto"): privilegia byte reali,
// poi velocita', poi peer che ci servono davvero.
const scoreOf = (s) => {
    if (!s) return -1;
    const downloaded = +s.downloaded || 0;
    const speed = +s.downloadSpeed || 0;
    const unchoked = +s.unchoked || 0;
    return downloaded + Math.min(speed, FAST_SPEED) * 2 + (unchoked > 0 ? ALIVE_SPEED : 0);
};

// candidates: [{ infoHash, fileIdx, sources, stream, seeders }]
// serverUrl: base dello streaming-server (es. http://127.0.0.1:11470)
// onStatus(optional): (info) => void   info = { phase, leaderInfoHash, elapsedMs }
// signal(optional): AbortSignal per cancellare la race (utente esce dalla card)
//
// Ritorna il candidato vincitore (SEMPRE un elemento di candidates, mai null se
// candidates non vuoto), gia' scaldato sul server.
const raceTorrents = ({ candidates, serverUrl, onStatus, signal }) => {
    const server = normServer(serverUrl);
    const list = (Array.isArray(candidates) ? candidates : []).filter((c) => c && typeof c.infoHash === 'string');
    // Guard fail-open: niente server o niente candidati torrent -> primo candidato.
    if (!server || list.length === 0) {
        return Promise.resolve((candidates && candidates[0]) || null);
    }
    if (list.length === 1) {
        // Un solo candidato: scaldalo comunque (parte prima) ma non c'e' race.
        createTorrent(server, list[0].infoHash, list[0].fileIdx, buildSources(list[0].stream, list[0].infoHash));
        return Promise.resolve(list[0]);
    }
    const racers = list.slice(0, RACE_K);
    const aborted = () => signal && signal.aborted;

    // Avvia tutti in parallelo (inietta sorgenti reali).
    racers.forEach((c) => createTorrent(server, c.infoHash, c.fileIdx, buildSources(c.stream, c.infoHash)));

    const start = Date.now();
    const last = new Map(); // infoHash -> ultimo stats

    return new Promise((resolve) => {
        let done = false;
        const finish = (winner) => {
            if (done) return;
            done = true;
            // Rimuovi i perdenti (libera slot/connessioni). Il vincitore resta caldo.
            racers.forEach((c) => { if (c.infoHash !== winner.infoHash) removeTorrent(server, c.infoHash); });
            resolve(winner);
        };

        const tick = () => {
            if (done) return;
            if (aborted()) { done = true; resolve(null); return; }
            const elapsed = Date.now() - start;

            Promise.all(racers.map((c) => statsOf(server, c.infoHash, c.fileIdx).then((s) => { if (s) last.set(c.infoHash, s); })))
                .then(() => {
                    if (done) return;
                    // 0) Server irraggiungibile? Un server VIVO risponde subito con
                    // stats (anche a 0 byte); se dopo UNREACHABLE_MS nessun candidato
                    // ha MAI risposto -> e' giu' -> fail-open al piu' seedato, non
                    // aspettare tutta la finestra (era 9s di attesa a vuoto).
                    if (last.size === 0 && elapsed >= UNREACHABLE_MS) {
                        if (onStatus) onStatus({ phase: 'unreachable', leaderInfoHash: racers[0].infoHash, elapsedMs: elapsed });
                        finish(racers[0]);
                        return;
                    }
                    // 1) Qualcuno pronto? Vince il primo pronto (a parita', piu' byte).
                    const ready = racers.filter((c) => isReady(last.get(c.infoHash)));
                    if (ready.length > 0) {
                        ready.sort((a, b) => scoreOf(last.get(b.infoHash)) - scoreOf(last.get(a.infoHash)));
                        if (onStatus) onStatus({ phase: 'ready', leaderInfoHash: ready[0].infoHash, elapsedMs: elapsed });
                        finish(ready[0]);
                        return;
                    }
                    // 2) Timeout: nessuno pronto -> il migliore per punteggio (o il piu' seedato se tutti a 0).
                    if (elapsed >= RACE_MS) {
                        const ranked = racers.slice().sort((a, b) => scoreOf(last.get(b.infoHash)) - scoreOf(last.get(a.infoHash)));
                        const best = scoreOf(last.get(ranked[0].infoHash)) > 0 ? ranked[0] : racers[0];
                        if (onStatus) onStatus({ phase: 'timeout', leaderInfoHash: best.infoHash, elapsedMs: elapsed });
                        finish(best);
                        return;
                    }
                    // 3) Continua: segnala il leader corrente (per feedback UI).
                    const leader = racers.slice().sort((a, b) => scoreOf(last.get(b.infoHash)) - scoreOf(last.get(a.infoHash)))[0];
                    if (onStatus) onStatus({ phase: 'racing', leaderInfoHash: leader && leader.infoHash, elapsedMs: elapsed });
                    setTimeout(tick, POLL_MS);
                });
        };
        tick();
    });
};

module.exports = { raceTorrents, RACE_K, RACE_MS, isReady, scoreOf, buildSources, READY_BYTES, FAST_SPEED };
