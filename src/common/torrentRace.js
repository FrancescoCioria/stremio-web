// Copyright (C) 2017-2023 Smart code 203358507
//
// Motore "Auto": data una lista di stream candidati (gia' filtrati per qualita' +
// ordinati per seeder), aggiunge i piu' promettenti IN PARALLELO a TorrServer
// (:8090), polla la salute REALE dello swarm e ritorna quello che scarica meglio;
// i perdenti vengono rimossi. Sostituisce il vecchio motore su :11470 (rotto):
// STESSO comportamento, engine nuovo. Vedi docs/stremio-torrserver.md.
//
// Perche' in-browser e non nel backend: il player carica lo stream da TorrServer;
// scaldando qui i torrent, quando navighiamo al player il vincitore sta gia'
// scaricando e parte subito. Racing su swarm disgiunti NON si ruba banda a vicenda
// (il collo e' lo swarm del singolo torrent, non la banda — 2.5Gbps fibra).
//
// FAIL-OPEN TOTALE: TorrServer irraggiungibile / fetch in errore / nessun
// candidato che scarica -> ritorna il candidato piu' seedato senza bloccare nulla
// (il "peggio" = comportarsi come un click manuale sul primo stream).

const RACE_K = 4; // max candidati in parallelo
const POLL_MS = 1000; // intervallo polling stats TorrServer
const RACE_MS = 20000; // finestra massima prima del timeout
const UNREACHABLE_MS = 2500; // se dopo questo nessuno ha MAI risposto -> TorrServer giu' -> fail-open
const MIN_RACE_MS = 4000; // finestra MINIMA: corriamo sempre qualche secondo prima di decidere
const MB = 1024 * 1024;
const STRONG_SPEED = 1.5 * MB; // >= -> "chiaramente buono", decidibile in anticipo

// hash (40 hex) dall'url del nostro addon: .../stremio-addon/ts/<hash>/<idx>
const hashFromUrl = (url) => {
    const m = typeof url === 'string' && url.match(/\/ts\/([a-f0-9]{40})\b/i);
    return m ? m[1].toLowerCase() : null;
};
// base TorrServer dall'url addon (stesso host, porta 8090). Cosi' funziona sia
// dalla tile (100.114...:8765 -> :8090) sia dal Mac (Tailscale), senza hardcode.
const torrserverBase = (url) => {
    try { const u = new URL(url); return u.protocol + '//' + u.hostname + ':8090'; }
    catch (_e) { return null; }
};
// tracker dai sources dello stream (["tracker:udp://...", ...]) per l'add magnet.
const trackersOf = (stream) => {
    const raw = stream && Array.isArray(stream.sources) ? stream.sources : [];
    return raw.filter((s) => typeof s === 'string' && s.indexOf('tracker:') === 0).map((s) => s.slice(8));
};

const post = (base, body, timeoutMs) => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs || 5000);
    return fetch(base + '/torrents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal
    }).then((r) => (r && r.ok ? r.json() : null)).catch(() => null).then((v) => { clearTimeout(to); return v; });
};
// Aggiunge (idempotente) un torrent a TorrServer iniettando i tracker reali.
const addTorrent = (base, hash, trackers) => {
    let link = 'magnet:?xt=urn:btih:' + hash;
    (trackers || []).forEach((tr) => { link += '&tr=' + encodeURIComponent(tr); });
    return post(base, { action: 'add', link: link, title: hash, save_to_db: true }, 6000);
};
const getTorrent = (base, hash) => post(base, { action: 'get', hash: hash }, 4000);
// Rimuove un torrent (libera i perdenti). Best-effort.
const remTorrent = (base, hash) => { try { post(base, { action: 'rem', hash: hash }, 3000); } catch (_e) { /* best-effort */ } };

// Metriche safe da un /torrents get di TorrServer. active_peers/download_speed/
// preloaded_bytes sono null quando il torrent e' "in db" (non attivo) -> 0.
const metricsOf = (t) => ({
    peers: +((t && t.active_peers) || 0),
    seeders: +((t && t.connected_seeders) || 0),
    speed: +((t && t.download_speed) || 0), // byte/s
    preloaded: +((t && t.preloaded_bytes) || 0)
});
// Rete VIVA adesso: byte in arrivo o peer/seeder connessi.
const isLiveM = (m) => m.speed > 0 || m.peers > 0 || m.seeders > 0;
// Punteggio "reggera' l'INTERO video?": throughput reale + swarm PRIMARI (predicono
// la consegna di tutto il film); la cache (preloaded) da' solo un vantaggio di
// partenza -> peso minimo, cosi' una cache minuscola NON batte uno swarm sano.
const scoreOf = (t) => {
    if (!t) return -1;
    const m = metricsOf(t);
    return Math.min(m.speed, 8 * MB) / 1e5 // throughput reale: PRIMARIO
        + m.seeders * 5                     // seeder connessi = reggono il film
        + m.peers * 2                       // resilienza swarm
        + m.preloaded / 1e8;                // spareggio fine (cache di partenza)
};
// "Chiaramente buono" (decidibile dopo la finestra minima): scarica gia' forte,
// oppure ha piu' seeder connessi CHE gli stanno servendo byte.
const isStrongM = (m) => m.speed >= STRONG_SPEED || (m.seeders >= 3 && m.speed > 0);
// Apribile: ha almeno rete viva. Se a fine finestra nessuno ce l'ha -> null -> il
// chiamante ricade sulla lista manuale (niente stallo forzato).
const isPlayableM = (m) => isLiveM(m);

// candidates: [{ hash, base, trackers, seeders, stream }]  (base = URL TorrServer)
// signal(optional): AbortSignal per cancellare la race (utente esce dalla card)
// Ritorna il candidato vincitore (gia' scaldato su TorrServer), OPPURE null se dopo
// la finestra nessuno e' giocabile. TorrServer irraggiungibile -> fail-open al primo.
const raceTorrents = ({ candidates, signal }) => {
    const list = (Array.isArray(candidates) ? candidates : []).filter((c) => c && c.hash && c.base);
    if (list.length === 0) return Promise.resolve((candidates && candidates[0]) || null);
    const base = list[0].base;
    if (list.length === 1) {
        addTorrent(base, list[0].hash, list[0].trackers);
        return Promise.resolve(list[0]);
    }
    const racers = list.slice(0, RACE_K);
    const aborted = () => signal && signal.aborted;
    racers.forEach((c) => addTorrent(base, c.hash, c.trackers));
    const start = Date.now();
    const lastStats = new Map();

    return new Promise((resolve) => {
        let done = false;
        const finish = (winner) => {
            if (done) return;
            done = true;
            racers.forEach((c) => { if (c.hash !== winner.hash) remTorrent(base, c.hash); });
            resolve(winner);
        };
        const tick = () => {
            if (done) return;
            if (aborted()) { done = true; resolve(null); return; }
            const elapsed = Date.now() - start;
            Promise.all(racers.map((c) => getTorrent(base, c.hash).then((t) => { if (t) lastStats.set(c.hash, t); })))
                .then(() => {
                    if (done) return;
                    // 0) TorrServer irraggiungibile -> fail-open al piu' seedato.
                    if (lastStats.size === 0 && elapsed >= UNREACHABLE_MS) { finish(racers[0]); return; }
                    const ranked = racers.slice().sort((a, b) => scoreOf(lastStats.get(b.hash)) - scoreOf(lastStats.get(a.hash)));
                    const best = ranked[0];
                    // 1) Finestra minima: mai vincita istantanea su un segnale ambiguo.
                    if (elapsed < MIN_RACE_MS) { setTimeout(tick, POLL_MS); return; }
                    // 2) Decidi in anticipo se il migliore e' chiaramente buono.
                    if (isStrongM(metricsOf(lastStats.get(best.hash)))) { finish(best); return; }
                    // 3) Timeout: prendi il migliore se giocabile; se nessuno -> null.
                    if (elapsed >= RACE_MS) {
                        const anyPlayable = racers.some((c) => isPlayableM(metricsOf(lastStats.get(c.hash))));
                        if (!anyPlayable) { racers.forEach((c) => remTorrent(base, c.hash)); done = true; resolve(null); return; }
                        finish(best);
                        return;
                    }
                    // 4) Continua a correre.
                    setTimeout(tick, POLL_MS);
                });
        };
        tick();
    });
};

module.exports = {
    raceTorrents, hashFromUrl, torrserverBase, trackersOf,
    RACE_K, RACE_MS, MIN_RACE_MS, scoreOf, isStrongM, isPlayableM
};
