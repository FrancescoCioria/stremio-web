// Copyright (C) 2017-2023 Smart code 203358507
//
// Motore "Auto": data una lista di stream candidati (gia' filtrati per qualita' +
// ordinati per seeder), aggiunge i piu' promettenti IN PARALLELO a TorrServer
// (:8090), polla la salute REALE dello swarm e ritorna quello che scarica meglio.
// Sostituisce il vecchio motore su :11470 (rotto). Vedi docs/stremio-torrserver.md.
//
// Perche' in-browser e non nel backend: il player carica lo stream da TorrServer;
// scaldando qui i torrent, quando navighiamo al player il vincitore sta gia'
// scaricando e parte subito. Racing su swarm disgiunti NON si ruba banda a vicenda
// (il collo e' lo swarm del singolo torrent, non la banda — 2.5Gbps fibra).
//
// FAIL-OPEN TOTALE: TorrServer irraggiungibile / fetch in errore / nessun
// candidato che scarica -> ritorna il candidato piu' seedato senza bloccare nulla
// (il "peggio" = comportarsi come un click manuale sul primo stream).
//
// ⚠️ NON rimuovere i perdenti con `action: rem`. TorrServer e' UNO e CONDIVISO fra
// tutti i client (TV + Mac remoti). Un `rem` su un torrent con un lettore attivo
// ne uccide il reader all'istante (verificato 2026-07-09: la connessione muore in
// 8.008s, curl exit=18): se un secondo utente apre lo stesso titolo, la sua race
// staccherebbe il film a chi sta gia' guardando. I torrent senza lettori li chiude
// TorrServer da solo dopo TorrentDisconnectTimeout=30s ("Torrent close by timeout").

const { casaBeacon } = require('./casaBackend');

const RACE_K = 4; // max candidati in parallelo
const POLL_MS = 1000; // intervallo polling stats TorrServer
const RACE_MS = 20000; // finestra massima prima del timeout
const UNREACHABLE_MS = 2500; // se dopo questo nessuno ha MAI risposto -> TorrServer giu' -> fail-open
const MIN_RACE_MS = 4000; // finestra MINIMA: corriamo sempre qualche secondo prima di decidere
// Finestra entro cui aspettiamo i candidati ancora SENZA metadata prima di
// chiudere in anticipo. TorrServer molla il fetch dei metadata di un magnet dopo
// ~10s ("error add torrent: timeout connection get torrent info"): senza questa
// attesa un torrent lento-a-risolvere ma sano non entra MAI in classifica e la
// race incorona chi ha risposto per primo. Incidente 2026-07-09.
const METADATA_GRACE_MS = 12000;
const MB = 1024 * 1024;
const STRONG_SPEED = 1.5 * MB; // >= -> "chiaramente buono", decidibile in anticipo
// Pavimento di throughput per la clausola "tanti seeder". Senza, `speed > 0`
// bastava: un torrent con 3 seeder che sgocciolano 130 KB/s (~1 Mbps, contro gli
// ~8-10 Mbps di un 1080p WEB-DL) vinceva la race dopo 10s. Il player ci si
// attaccava e restava appeso sul HEAD master.m3u8 perche' ffmpeg non riceveva
// byte a sufficienza per emettere la playlist. Incidente 2026-07-09.
const MIN_WIN_SPEED = 300 * 1024; // byte/s

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

// Telemetria: la decisione della race era invisibile nei log (si poteva solo
// dedurla a posteriori dagli add/rem di TorrServer). La POSTiamo al backend, che
// la persiste in ~/.local/state/stremio-race.log. Best-effort, mai bloccante.
const reportDecision = (payload) => casaBeacon('/debug/race-event', payload);

// Metriche safe da un /torrents get di TorrServer. active_peers/download_speed/
// preloaded_bytes sono null quando il torrent e' "in db" (non attivo) -> 0.
const metricsOf = (t) => ({
    peers: +((t && t.active_peers) || 0),
    seeders: +((t && t.connected_seeders) || 0),
    speed: +((t && t.download_speed) || 0), // byte/s
    preloaded: +((t && t.preloaded_bytes) || 0)
});
// Punteggio "reggera' l'INTERO video?": throughput reale + swarm PRIMARI (predicono
// la consegna di tutto il film); la cache (preloaded) da' solo un vantaggio di
// partenza -> peso minimo, cosi' una cache minuscola NON batte uno swarm sano.
const scoreOf = (t) => {
    if (!t) return -1;
    const m = metricsOf(t);
    return Math.min(m.speed, 8 * MB) / 1e5 // throughput reale: PRIMARIO
        + m.seeders * 5 // seeder connessi = reggono il film
        + m.peers * 2 // resilienza swarm
        + m.preloaded / 1e8; // spareggio fine (cache di partenza)
};
// SEGNALE FORTE: scarica cosi' forte (>= 12 Mbps) che nessun rivale potrebbe
// farci cambiare idea -> si parte SUBITO, senza aspettare i metadata altrui.
// Tenerlo separato evita di pagare METADATA_GRACE_MS su ogni play che ha in lista
// un magnet morto (caso comune: +8s all'avvio, per nulla).
const isVeryStrongM = (m) => m.speed >= STRONG_SPEED;
// SEGNALE DEBOLE: tanti seeder che gli servono byte a un ritmo utile (non un
// gocciolamento: vedi MIN_WIN_SPEED). Indizio, non prova -> lo si onora solo
// quando nessuno sta ancora risolvendo i metadata (o e' scaduta la grace).
const hasHealthySwarmM = (m) => m.seeders >= 3 && m.speed >= MIN_WIN_SPEED;
// "Chiaramente buono" = uno dei due. Esportata come concetto, ma il call-site usa
// i due predicati separati: hanno tempi di validita' diversi.
const isStrongM = (m) => isVeryStrongM(m) || hasHealthySwarmM(m);

// Evidenza CUMULATIVA su tutta la race (non l'istantanea di un singolo poll: la
// speed oscilla e puo' leggere 0 anche mentre scarica). Solo massimi: gli ultimi
// valori si rileggono da `lastStats`, non vanno duplicati qui.
const emptyEvidence = () => ({ maxSpeed: 0, maxPreloaded: 0, maxSeeders: 0, maxPeers: 0, polls: 0 });
const foldEvidence = (e, m) => ({
    maxSpeed: Math.max(e.maxSpeed, m.speed),
    maxPreloaded: Math.max(e.maxPreloaded, m.preloaded),
    maxSeeders: Math.max(e.maxSeeders, m.seeders),
    maxPeers: Math.max(e.maxPeers, m.peers),
    polls: e.polls + 1
});
// Giocabile = ha REALMENTE mosso byte almeno una volta. Prima bastava
// `peers > 0 || seeders > 0`: un torrent con peer connessi che non consegnano mai
// nulla passava il controllo, vinceva per mancanza di rivali e il player restava
// a fissare uno spinner per sempre. Meglio ritornare null e mostrare la lista
// manuale che appendere l'utente. Incidente 2026-07-09.
const hasMovedBytes = (e) => e.maxSpeed > 0 || e.maxPreloaded > 0;

// Stato visuale di un candidato per la UI della race (uno "steppino" per torrent):
//   pending     -> TorrServer non ha ancora risposto (metadata non risolti)
//   alive       -> metadata risolti (c'e' swarm/peers) ma ancora zero byte
//   downloading -> ha mosso byte (maxSpeed>0 o preload>0)
//   winner      -> incoronato
const raceStepState = (hasStats, e, isWinner) =>
    isWinner ? 'winner' : (!hasStats ? 'pending' : (hasMovedBytes(e) ? 'downloading' : 'alive'));

// candidates: [{ hash, base, trackers, seeders, stream }]  (base = URL TorrServer)
// signal(optional): AbortSignal per cancellare la race (utente esce dalla card)
// timing(optional): override delle costanti temporali (test)
// onDecision(optional): sink della telemetria (test); default = POST al backend
// Ritorna il candidato vincitore (gia' scaldato su TorrServer), OPPURE null se dopo
// la finestra nessuno ha mosso byte. TorrServer irraggiungibile -> fail-open al primo.
const raceTorrents = ({ candidates, signal, timing, onDecision, onProgress }) => {
    const T = Object.assign({
        pollMs: POLL_MS, raceMs: RACE_MS, minRaceMs: MIN_RACE_MS,
        unreachableMs: UNREACHABLE_MS, metadataGraceMs: METADATA_GRACE_MS
    }, timing || {});
    const report = onDecision || reportDecision;
    const list = (Array.isArray(candidates) ? candidates : []).filter((c) => c && c.hash && c.base);
    if (list.length === 0) return Promise.resolve((candidates && candidates[0]) || null);
    const base = list[0].base;
    // Un solo candidato: nessuna scelta da fare, lo scaldiamo e lo apriamo. NON gli
    // applichiamo i controlli di salute (maxSpeed/too-slow): scartarlo manderebbe
    // l'utente a una lista manuale che contiene esattamente quello stesso stream,
    // dopo 20s di attesa. Equivale a un click manuale — il baseline fail-open
    // dichiarato in testa al file. Lo logghiamo comunque, o il race log mentirebbe
    // per omissione dicendo "una riga per ogni decisione".
    // ⚠️ EDGE ACCETTATO, non risolto: se quell'unico torrent gocciola, il player
    // resta appeso come prima del fix. Non c'e' alternativa da offrire, quindi
    // preferiamo aprire subito; ma il caso NON e' coperto dai controlli di salute.
    if (list.length === 1) {
        addTorrent(base, list[0].hash, list[0].trackers);
        report({ ev: 'torrent-race', reason: 'single', elapsedMs: 0, winner: list[0].hash, racers: [] });
        return Promise.resolve(list[0]);
    }
    const racers = list.slice(0, RACE_K);
    const aborted = () => signal && signal.aborted;
    racers.forEach((c) => addTorrent(base, c.hash, c.trackers));
    const start = Date.now();
    const lastStats = new Map();
    const evidence = new Map();
    const ev = (hash) => evidence.get(hash) || emptyEvidence();

    const snapshot = (reason, elapsed, winner) => ({
        ev: 'torrent-race',
        reason: reason, // strong | timeout | unreachable | no-bytes | aborted
        elapsedMs: elapsed,
        winner: winner ? winner.hash : null,
        racers: racers.map((c) => {
            const e = ev(c.hash);
            // Ultimo campione: uno swarm che sale a 5 seeder e poi collassa a 0 deve
            // restare leggibile nel post-mortem accanto al suo picco.
            const last = metricsOf(lastStats.get(c.hash));
            return {
                hash: c.hash,
                advertisedSeeders: c.seeders, // seeder dichiarati dall'addon
                metadataResolved: lastStats.has(c.hash), // false = TorrServer non ha mai risposto
                maxSpeed: e.maxSpeed,
                maxPreloaded: e.maxPreloaded,
                maxSeeders: e.maxSeeders,
                maxPeers: e.maxPeers,
                lastSeeders: last.seeders,
                lastPeers: last.peers,
                polls: e.polls,
                score: scoreOf(lastStats.get(c.hash))
            };
        })
    });

    // Progress live per la UI (uno step per racer). Best-effort, opzionale.
    const emitProgress = (winner) => {
        if (typeof onProgress !== 'function') return;
        onProgress(racers.map((c) => ({
            hash: c.hash,
            state: raceStepState(lastStats.has(c.hash), ev(c.hash), !!(winner && c.hash === winner.hash)),
        })));
    };

    return new Promise((resolve) => {
        let done = false;
        // Unica uscita: `winner === null` = rinuncia (il chiamante mostra la lista
        // manuale). NB: nessun remTorrent sui perdenti — vedi nota in testa al file.
        const settle = (winner, reason, elapsed) => {
            if (done) return;
            done = true;
            report(snapshot(reason, elapsed, winner));
            emitProgress(winner);
            resolve(winner);
        };
        const tick = () => {
            if (done) return;
            const elapsed = Date.now() - start;
            if (aborted()) { settle(null, 'aborted', elapsed); return; }
            Promise.all(racers.map((c) => getTorrent(base, c.hash).then((t) => {
                if (!t) return;
                lastStats.set(c.hash, t);
                evidence.set(c.hash, foldEvidence(ev(c.hash), metricsOf(t)));
            })))
                .then(() => {
                    if (done) return;
                    emitProgress(null); // aggiorna gli steppini con l'evidenza di questo poll
                    // 0) TorrServer irraggiungibile -> fail-open al piu' seedato.
                    if (lastStats.size === 0 && elapsed >= T.unreachableMs) { settle(racers[0], 'unreachable', elapsed); return; }
                    const ranked = racers.slice().sort((a, b) => scoreOf(lastStats.get(b.hash)) - scoreOf(lastStats.get(a.hash)));
                    const best = ranked[0];
                    // 1) Finestra minima: mai vincita istantanea su un segnale ambiguo.
                    if (elapsed < T.minRaceMs) { setTimeout(tick, T.pollMs); return; }
                    // 2) Decidi in anticipo se il migliore e' chiaramente buono.
                    //    Segnale FORTE -> si parte e basta. Segnale DEBOLE -> prima
                    //    aspettiamo chi sta ancora risolvendo i metadata, altrimenti
                    //    incoroniamo chi ha risposto per primo invece del migliore.
                    //    Un magnet morto non ci costa nulla: resta `pending`, ma il
                    //    ramo forte lo scavalca e comunque raceMs chiude tutto.
                    const bestM = metricsOf(lastStats.get(best.hash));
                    const pending = racers.some((c) => !lastStats.has(c.hash));
                    const mayTrustWeakSignal = !pending || elapsed >= T.metadataGraceMs;
                    if (isVeryStrongM(bestM) || (mayTrustWeakSignal && hasHealthySwarmM(bestM))) { settle(best, 'strong', elapsed); return; }
                    // 3) Timeout: vince il migliore fra quelli che possono REGGERE la
                    //    riproduzione, cioe' che hanno toccato almeno una volta
                    //    MIN_WIN_SPEED. Un torrent che in 20s non ha mai superato i
                    //    300 KB/s non consegnera' un 1080p (~8-10 Mbps): incoronarlo
                    //    significa appendere il player sul HEAD master.m3u8 per
                    //    sempre. Meglio `null` -> lista manuale, dove l'utente sceglie
                    //    (e puo' comunque riprovare lo stesso torrent). 2026-07-09.
                    if (elapsed >= T.raceMs) {
                        const movers = ranked.filter((c) => hasMovedBytes(ev(c.hash)));
                        if (movers.length === 0) { settle(null, 'no-bytes', elapsed); return; }
                        const viable = movers.filter((c) => ev(c.hash).maxSpeed >= MIN_WIN_SPEED);
                        if (viable.length === 0) { settle(null, 'too-slow', elapsed); return; }
                        settle(viable[0], 'timeout', elapsed);
                        return;
                    }
                    // 4) Continua a correre.
                    setTimeout(tick, T.pollMs);
                });
        };
        tick();
    });
};

module.exports = {
    raceTorrents, hashFromUrl, torrserverBase, trackersOf,
    RACE_K, RACE_MS, MIN_RACE_MS, METADATA_GRACE_MS, MIN_WIN_SPEED, STRONG_SPEED,
    scoreOf, isStrongM, isVeryStrongM, hasHealthySwarmM, hasMovedBytes,
    metricsOf, emptyEvidence, foldEvidence, raceStepState
};
