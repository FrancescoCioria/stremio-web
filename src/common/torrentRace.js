// Copyright (C) 2017-2023 Smart code 203358507
//
// Motore "Auto": data una lista di stream torrent candidati (gia' filtrati per
// qualita' + ordinati per seeder), li avvia IN PARALLELO sullo streaming-server
// locale (:11470), polla la salute REALE dello swarm (stats.json) su una finestra
// minima e ritorna quello che meglio reggera' l'INTERO video (throughput + swarm >
// cache ambigua). I perdenti vengono rimossi.
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
const RACE_MS = 20000; // finestra massima di race prima del timeout (i cachati/vivi vincono molto prima)
const UNREACHABLE_MS = 1500; // se dopo questo nessuno ha MAI risposto -> server giu' -> fail-open
const MIN_RACE_MS = 4000; // finestra MINIMA: corriamo SEMPRE qualche secondo prima di
// decidere — mai vincita istantanea su un singolo segnale ambiguo (streamProgress=1
// puo' essere "tutto il file in cache" OPPURE "solo la testa cachata, swarm morto":
// indistinguibili dalle stats). Qualche secondo lascia emergere la salute reale.
const MB = 1024 * 1024;
const SPEED_CAP = 8 * MB; // cap per il punteggio throughput
const STRONG_SPEED = 1.5 * MB; // >= -> "chiaramente buono", decidibile in anticipo

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

// Metriche numeriche safe da uno stats.json.
// ⚠️ Segnale CHIAVE = `streamProgress` (0..1, "buffer sufficiente a giocare", 1=pronto),
// dal file-level stats. Perche' NON `downloaded`: alla ri-creazione di un torrent
// gia' in cache il contatore `downloaded` si AZZERA (verificato: un file 984MB in
// cache riporta downloaded=0 ma streamProgress=1). Usare `downloaded` ci faceva
// NON riconoscere il cachato-pronto e ricadere sul piu'-seedato MORTO. Incidente
// 2026-07-03 (0 peers ma selezionato): la teoria "cache pollution di downloaded"
// era sbagliata -> il vero segnale e' streamProgress. Serve pero' pollare a
// FILE-LEVEL (torrent-level non espone streamProgress) -> candidati con fileIdx.
const metricsOf = (s) => ({
    downloaded: +(s && s.downloaded) || 0,
    speed: +(s && s.downloadSpeed) || 0,
    unchoked: +(s && s.unchoked) || 0,
    peers: +(s && s.peers) || 0,
    streamLen: +(s && s.streamLen) || 0,
    progress: (s && typeof s.streamProgress === 'number') ? s.streamProgress : 0
});
// Rete VIVA adesso: un peer ci sta servendo (unchoked) o stanno arrivando byte.
const isLiveM = (m) => m.unchoked > 0 || m.speed > 0;

// Punteggio "reggera' l'INTERO video?". La THROUGHPUT reale (byte/s dallo swarm) e la
// dimensione dello swarm predicono la consegna di tutto il film -> PRIMARIE. Lo
// streamProgress (buffer/cache) da' solo un vantaggio di PARTENZA -> peso MODESTO, cosi'
// una cache minuscola NON batte uno swarm sano (che invece garantisce l'intero video).
// Perche' non fidarsi di streamProgress da solo: =1 puo' essere "tutto in cache" (ottimo)
// o "solo la testa cachata, resto morto" (pessimo) -> indistinguibili. Quindi lo swarm
// vivo, che consegna comunque tutto, e' il predittore piu' sicuro.
const scoreOf = (s) => {
    if (!s) return -1;
    const m = metricsOf(s);
    return Math.min(m.speed, SPEED_CAP) / 1e5 // throughput reale: PRIMARIO (0..~80)
        + (m.unchoked > 0 ? 40 : 0) // un peer ci serve DAVVERO adesso
        + m.peers * 3 // resilienza dello swarm
        + m.progress * 25 // partenza pronta (cache/buffer): bonus MODESTO
        + m.downloaded / 1e8; // spareggio fine
};
// "Chiaramente buono" (decidibile in anticipo, dopo la finestra minima): sta gia'
// scaricando forte, OPPURE e' bufferato/cachato E ha uno swarm dietro (non solo cache
// nuda, che potrebbe essere una testa morta).
const isStrongM = (m) => m.speed >= STRONG_SPEED || (m.progress >= 0.9 && m.peers > 0);
// Apribile solo se ha QUALCOSA (buffer, rete, o peer). Se a fine finestra nessuno ce
// l'ha -> null -> il chiamante ricade sulla lista manuale (niente stallo forzato).
const isPlayableM = (m) => m.progress > 0 || isLiveM(m) || m.peers > 0;

// candidates: [{ infoHash, fileIdx, sources, stream, seeders }]
// serverUrl: base dello streaming-server (es. http://127.0.0.1:11470)
// onStatus(optional): (info) => void   info = { phase, leaderInfoHash, elapsedMs }
// signal(optional): AbortSignal per cancellare la race (utente esce dalla card)
//
// Ritorna il candidato vincitore (gia' scaldato sul server), OPPURE null se dopo la
// finestra NESSUN candidato e' giocabile (0 buffer/rete/peer) -> il chiamante ricade
// sulla lista manuale. Su server irraggiungibile/assente -> fail-open al piu' seedato.
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
                    // 1) Finestra MINIMA: corriamo sempre qualche secondo prima di
                    // decidere -> niente vincita istantanea su un segnale ambiguo.
                    const ranked = racers.slice().sort((a, b) => scoreOf(last.get(b.infoHash)) - scoreOf(last.get(a.infoHash)));
                    const best = ranked[0];
                    if (elapsed < MIN_RACE_MS) {
                        if (onStatus) onStatus({ phase: 'racing', leaderInfoHash: best && best.infoHash, elapsedMs: elapsed });
                        setTimeout(tick, POLL_MS);
                        return;
                    }
                    // 2) Passata la finestra minima: decidi in ANTICIPO solo se il migliore
                    // e' CHIARAMENTE buono (scarica forte, o cachato CON swarm dietro).
                    // Altrimenti continua a cercare uno swarm vivo (che regge tutto il video).
                    const bestM = metricsOf(last.get(best.infoHash));
                    if (isStrongM(bestM)) {
                        if (onStatus) onStatus({ phase: 'ready', leaderInfoHash: best.infoHash, elapsedMs: elapsed });
                        finish(best);
                        return;
                    }
                    // 3) Timeout massimo: prendi il migliore se giocabile; se NESSUNO lo e'
                    // (0 buffer, 0 rete, 0 peer) -> null -> il chiamante ricade sul manuale.
                    if (elapsed >= RACE_MS) {
                        const anyPlayable = racers.some((c) => isPlayableM(metricsOf(last.get(c.infoHash))));
                        if (!anyPlayable) {
                            if (onStatus) onStatus({ phase: 'nolive', elapsedMs: elapsed });
                            racers.forEach((c) => removeTorrent(server, c.infoHash));
                            done = true; resolve(null);
                            return;
                        }
                        if (onStatus) onStatus({ phase: 'timeout', leaderInfoHash: best.infoHash, elapsedMs: elapsed });
                        finish(best);
                        return;
                    }
                    // 4) Continua a correre (feedback leader corrente).
                    if (onStatus) onStatus({ phase: 'racing', leaderInfoHash: best.infoHash, elapsedMs: elapsed });
                    setTimeout(tick, POLL_MS);
                });
        };
        tick();
    });
};

module.exports = { raceTorrents, RACE_K, RACE_MS, MIN_RACE_MS, scoreOf, isStrongM, isPlayableM, buildSources };
