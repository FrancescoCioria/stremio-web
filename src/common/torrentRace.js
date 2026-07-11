// Copyright (C) 2017-2023 Smart code 203358507
//
// Motore "Auto": data una lista di stream candidati (gia' filtrati per qualita' +
// ordinati per seeder), fa correre i piu' promettenti e ritorna quello che
// scarica meglio. Sostituisce il vecchio motore su :11470 (rotto).
// Vedi docs/stremio-torrserver.md.
//
// ⚠️ CHI SCARICA E' IL BACKEND, NON QUESTO FILE. TorrServer e' PIGRO: aggiungere
// un torrent (`action: add`) lo parcheggia nel DB e basta — non chiede un pezzo a
// nessuno finche' qualcuno non LEGGE lo stream. Fino al 2026-07-11 la race faceva
// esattamente questo: aggiungeva i candidati e poi interrogava `download_speed`
// aspettandosi di vedere chi scaricava. Misurava torrent fermi: leggeva 0-40 KB/s
// su tutti (traffico di protocollo, non contenuto), nessuno superava mai
// MIN_WIN_SPEED e ogni race chiudeva "too-slow" -> Auto non ha MAI incoronato
// nessuno (7 race su 7 nel race log). Intanto cliccare a mano il primo torrent
// partiva subito, perche' il click apre un reader.
//
// Ora: POST /stremio-addon/probe -> il backend apre un READER vero su ogni
// candidato (la sola cosa che fa scaricare TorrServer) e misura i BYTE DAVVERO
// CONSEGNATI; qui li leggiamo con GET /stremio-addon/probe e decidiamo.
// I byte devono scorrere sul BEELINK: leggerli di qua misurerebbe il WAN quando la
// pagina gira sul Mac remoto via Tailscale (~21 Mbps), non lo swarm.
//
// FAIL-OPEN TOTALE: backend irraggiungibile / fetch in errore / nessun candidato
// che scarica -> ritorna il candidato piu' seedato senza bloccare nulla (il
// "peggio" = comportarsi come un click manuale sul primo stream).
//
// ⚠️ Nessuno rimuove i perdenti (`action: rem`). TorrServer e' UNO e CONDIVISO fra
// tutti i client (TV + Mac remoti): un `rem` su un torrent con un lettore attivo
// ne uccide il reader all'istante (verificato 2026-07-09). I reader del probe si
// chiudono da soli alla loro finestra; i torrent senza lettori li chiude
// TorrServer dopo TorrentDisconnectTimeout=30s.

const { casaBeacon, casaBackendUrl } = require('./casaBackend');

const RACE_K = 4; // max candidati in parallelo
const POLL_MS = 1000; // intervallo di lettura delle misure dal backend
const RACE_MS = 20000; // finestra massima prima del timeout
const UNREACHABLE_MS = 2500; // se dopo questo il backend non ha MAI risposto -> fail-open
const MIN_RACE_MS = 4000; // finestra MINIMA: corriamo sempre qualche secondo prima di decidere
// Finestra entro cui aspettiamo i candidati ancora SENZA metadata prima di
// chiudere in anticipo: un magnet lento a risolvere ma sano non deve restare
// fuori dalla classifica solo perche' un rivale ha risposto per primo.
// Incidente 2026-07-09.
const METADATA_GRACE_MS = 12000;
const MB = 1024 * 1024;
const STRONG_SPEED = 1.5 * MB; // >= -> "chiaramente buono", decidibile in anticipo
// Pavimento di throughput: un torrent che non arriva qui non consegnera' un 1080p
// (~8-10 Mbps). Incoronarlo significa appendere il player. Incidente 2026-07-09.
const MIN_WIN_SPEED = 300 * 1024; // byte/s

// hash (40 hex) dall'url del nostro addon: .../stremio-addon/ts/<hash>/<idx>
const hashFromUrl = (url) => {
    const m = typeof url === 'string' && url.match(/\/ts\/([a-f0-9]{40})\b/i);
    return m ? m[1].toLowerCase() : null;
};
// "<stagione>.<episodio>" dall'url del nostro addon (?se=1.4), se e' una serie.
// Senza, il backend non saprebbe quale file di un season pack leggere e
// misurerebbe un episodio a caso.
const seFromUrl = (url) => {
    const m = typeof url === 'string' && url.match(/[?&]se=(\d+\.\d+)/);
    return m ? m[1] : null;
};

const PROBE_PATH = '/stremio-addon/probe';
const POST_TIMEOUT_MS = 6000;
const GET_TIMEOUT_MS = 4000;
// Margine oltre raceMs per la guardia anti-appeso (vedi il timer in raceTorrents).
const GUARD_MARGIN_MS = 5000;

// ⚠️ Ogni fetch ha il SUO timeout. Senza, una richiesta che resta appesa (backend
// in restart, WiFi del box in crash-loop) non rigetta mai: la race non si settla
// piu', gli steppini restano "pending" per sempre e le card qualita' smettono di
// rispondere ai click (`if (racing) return`). Il fail-open dichiarato in testa al
// file esiste solo se ogni attesa ha una fine.
const fetchJson = (url, opts, timeoutMs) => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    return fetch(url, Object.assign({ signal: ctrl.signal }, opts || {}))
        .then((r) => (r && r.ok ? r.json() : null))
        .catch(() => null)
        .then((v) => { clearTimeout(to); return v; });
};

// Chiede al backend di far partire i candidati (add + reader). Attesa: quando
// ritorna, i probe sono armati — NON che stiano gia' leggendo (il reader nasce
// dopo i metadata, per questo il backend li scalda gia' all'apertura della pagina).
const startProbes = (hashes, se, timeoutMs) => {
    const url = casaBackendUrl(PROBE_PATH);
    if (!url) return Promise.resolve(null);
    return fetchJson(url, {
        method: 'POST',
        // text/plain = "simple request": niente preflight CORS da gestire.
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ hashes: hashes, se: se })
    }, timeoutMs || POST_TIMEOUT_MS);
};

// Misure correnti: byte consegnati, throughput reale, metadata, salute swarm.
const fetchStats = (hashes, timeoutMs) => {
    const url = casaBackendUrl(PROBE_PATH + '?hashes=' + hashes.join(','));
    if (!url) return Promise.resolve(null);
    return fetchJson(url, null, timeoutMs || GET_TIMEOUT_MS)
        .then((j) => (j && Array.isArray(j.stats) ? j.stats : null));
};

// Decisa la race, i perdenti smettono di scaricare: continuare a leggere 3 torrent
// mentre il player apre il vincitore gli ruba banda e connessioni proprio adesso.
const stopProbes = (hashes) => {
    if (hashes.length > 0) casaBeacon(PROBE_PATH + '/stop', { hashes: hashes });
};

// Telemetria: la decisione della race era invisibile nei log. La POSTiamo al
// backend, che la persiste in ~/.local/state/stremio-race.log. Mai bloccante.
const reportDecision = (payload) => casaBeacon('/debug/race-event', payload);

// Metriche safe da una riga di /probe.
const metricsOf = (s) => ({
    speed: +((s && s.speed) || 0), // byte/s CONSEGNATI a un reader vero
    bytes: +((s && s.bytes) || 0), // byte totali letti finora
    seeders: +((s && s.seeders) || 0),
    peers: +((s && s.peers) || 0),
    metadata: !!(s && s.metadata) // false = il torrent non puo' ancora partire
});
// Punteggio "reggera' l'INTERO video?": throughput reale + swarm (predicono la
// consegna di tutto il film); i byte gia' scaricati danno solo un vantaggio di
// partenza -> peso minimo, cosi' una cache minuscola NON batte uno swarm sano.
const scoreOf = (s) => {
    if (!s) return -1;
    const m = metricsOf(s);
    return Math.min(m.speed, 8 * MB) / 1e5 // throughput reale: PRIMARIO
        + m.seeders * 5 // seeder connessi = reggono il film
        + m.peers * 2 // resilienza swarm
        + m.bytes / 1e8; // spareggio fine (byte gia' in cache)
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
// "Chiaramente buono" = uno dei due. Il call-site usa i due predicati separati:
// hanno tempi di validita' diversi.
const isStrongM = (m) => isVeryStrongM(m) || hasHealthySwarmM(m);

// Evidenza CUMULATIVA su tutta la race. Solo massimi: gli ultimi valori si
// rileggono da `lastStats`, non vanno duplicati qui.
const emptyEvidence = () => ({ maxSpeed: 0, maxBytes: 0, maxSeeders: 0, maxPeers: 0, polls: 0 });
const foldEvidence = (e, m) => ({
    maxSpeed: Math.max(e.maxSpeed, m.speed),
    maxBytes: Math.max(e.maxBytes, m.bytes),
    maxSeeders: Math.max(e.maxSeeders, m.seeders),
    maxPeers: Math.max(e.maxPeers, m.peers),
    polls: e.polls + 1
});
// Giocabile = ha REALMENTE consegnato byte almeno una volta. Un torrent con peer
// connessi che non consegnano nulla vincerebbe per mancanza di rivali e il player
// resterebbe a fissare uno spinner: meglio ritornare null e mostrare la lista
// manuale che appendere l'utente. Incidente 2026-07-09.
const hasMovedBytes = (e) => e.maxBytes > 0;

// Stato visuale di un candidato per la UI della race (uno "steppino" per torrent):
//   pending     -> metadata non ancora risolti (il torrent non puo' partire)
//   alive       -> metadata risolti, reader aperto, ma ancora zero byte
//   downloading -> sta consegnando byte
//   winner      -> incoronato
const raceStepState = (hasMetadata, e, isWinner) =>
    isWinner ? 'winner' : (!hasMetadata ? 'pending' : (hasMovedBytes(e) ? 'downloading' : 'alive'));

// candidates: [{ hash, seeders, stream }]
// signal(optional): AbortSignal per cancellare la race (utente esce dalla card)
// timing(optional): override delle costanti temporali (test)
// onDecision(optional): sink della telemetria (test); default = POST al backend
// Ritorna il candidato vincitore (gia' scaldato dal probe, quindi parte subito),
// OPPURE null se nessuno ha consegnato byte. Backend giu' -> fail-open al primo.
const raceTorrents = ({ candidates, signal, timing, onDecision, onProgress }) => {
    const T = Object.assign({
        pollMs: POLL_MS, raceMs: RACE_MS, minRaceMs: MIN_RACE_MS,
        unreachableMs: UNREACHABLE_MS, metadataGraceMs: METADATA_GRACE_MS,
        guardMarginMs: GUARD_MARGIN_MS,
        postTimeoutMs: POST_TIMEOUT_MS, getTimeoutMs: GET_TIMEOUT_MS
    }, timing || {});
    const report = onDecision || reportDecision;
    const list = (Array.isArray(candidates) ? candidates : []).filter((c) => c && c.hash);
    if (list.length === 0) return Promise.resolve((candidates && candidates[0]) || null);
    const se = seFromUrl(list[0].stream && list[0].stream.url);
    // Un solo candidato: nessuna scelta da fare, lo scaldiamo e lo apriamo. NON gli
    // applichiamo i controlli di salute (zero-byte/troppo-lento): scartarlo manderebbe
    // l'utente a una lista manuale che contiene esattamente quello stesso stream,
    // dopo 20s di attesa. Equivale a un click manuale — il baseline fail-open
    // dichiarato in testa al file. Lo logghiamo comunque, o il race log mentirebbe
    // per omissione dicendo "una riga per ogni decisione".
    // ⚠️ EDGE ACCETTATO, non risolto: se quell'unico torrent gocciola, il player
    // resta appeso come prima. Non c'e' alternativa da offrire.
    if (list.length === 1) {
        startProbes([list[0].hash], se, T.postTimeoutMs);
        report({ ev: 'torrent-race', reason: 'single', elapsedMs: 0, winner: list[0].hash, racers: [] });
        return Promise.resolve(list[0]);
    }
    const racers = list.slice(0, RACE_K);
    const hashes = racers.map((c) => c.hash);
    const aborted = () => signal && signal.aborted;
    const start = Date.now();
    const lastStats = new Map();
    const evidence = new Map();
    const ev = (hash) => evidence.get(hash) || emptyEvidence();

    const snapshot = (reason, elapsed, winner) => ({
        ev: 'torrent-race',
        reason: reason, // strong | timeout | unreachable | no-bytes | too-slow | aborted
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
                metadataResolved: last.metadata, // false = il torrent non e' mai partito
                maxSpeed: e.maxSpeed, // byte/s consegnati a un reader VERO (non piu' una stat a vuoto)
                maxBytes: e.maxBytes,
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
            state: raceStepState(metricsOf(lastStats.get(c.hash)).metadata, ev(c.hash), !!(winner && c.hash === winner.hash)),
        })));
    };

    return new Promise((resolve) => {
        let done = false;
        // Unica uscita: `winner === null` = rinuncia (il chiamante mostra la lista
        // manuale). NB: nessun remTorrent sui perdenti — vedi nota in testa al file:
        // si CHIUDONO i nostri reader, non si tocca il torrent (che potrebbe essere
        // letto da un altro client).
        const settle = (winner, reason, elapsed) => {
            if (done) return;
            done = true;
            clearTimeout(guard);
            stopProbes(racers.filter((c) => !winner || c.hash !== winner.hash).map((c) => c.hash));
            report(snapshot(reason, elapsed, winner));
            emitProgress(winner);
            resolve(winner);
        };
        // Verdetto a finestra scaduta: vince il migliore fra quelli che possono
        // REGGERE la riproduzione, cioe' che hanno toccato almeno una volta
        // MIN_WIN_SPEED. Un torrent che non ha mai superato i 300 KB/s non
        // consegnera' un 1080p (~8-10 Mbps): incoronarlo significa appendere il
        // player. Meglio `null` -> lista manuale, dove l'utente sceglie (e puo'
        // comunque riprovare lo stesso torrent). 2026-07-09.
        const decideAtTimeout = (elapsed) => {
            if (lastStats.size === 0) { settle(racers[0], 'unreachable', elapsed); return; }
            const ranked = racers.slice().sort((a, b) => scoreOf(lastStats.get(b.hash)) - scoreOf(lastStats.get(a.hash)));
            const movers = ranked.filter((c) => hasMovedBytes(ev(c.hash)));
            if (movers.length === 0) { settle(null, 'no-bytes', elapsed); return; }
            const viable = movers.filter((c) => ev(c.hash).maxSpeed >= MIN_WIN_SPEED);
            if (viable.length === 0) { settle(null, 'too-slow', elapsed); return; }
            settle(viable[0], 'timeout', elapsed);
        };
        // Guardia anti-appeso: il ciclo di poll si ri-arma DENTRO la `.then` del
        // fetch, quindi se una richiesta non tornasse mai (nonostante i timeout)
        // nessuno chiuderebbe piu' la race e le card qualita' resterebbero morte.
        // Questo timer e' l'unica cosa che garantisce che una decisione arrivi.
        const guard = setTimeout(
            () => decideAtTimeout(Date.now() - start),
            T.raceMs + (T.guardMarginMs || GUARD_MARGIN_MS)
        );
        const tick = () => {
            if (done) return;
            const elapsed = Date.now() - start;
            if (aborted()) { settle(null, 'aborted', elapsed); return; }
            fetchStats(hashes, T.getTimeoutMs).then((stats) => {
                if (done) return;
                (stats || []).forEach((s) => {
                    if (!s || !s.hash) return;
                    lastStats.set(s.hash, s);
                    evidence.set(s.hash, foldEvidence(ev(s.hash), metricsOf(s)));
                });
                emitProgress(null); // aggiorna gli steppini con l'evidenza di questo poll
                // 0) backend irraggiungibile -> fail-open al piu' seedato.
                if (lastStats.size === 0 && elapsed >= T.unreachableMs) { settle(racers[0], 'unreachable', elapsed); return; }
                const ranked = racers.slice().sort((a, b) => scoreOf(lastStats.get(b.hash)) - scoreOf(lastStats.get(a.hash)));
                const best = ranked[0];
                // 1) Finestra minima: mai vincita istantanea su un segnale ambiguo.
                if (elapsed < T.minRaceMs) { setTimeout(tick, T.pollMs); return; }
                // 2) Decidi in anticipo se il migliore e' chiaramente buono.
                //    Segnale FORTE -> si parte e basta. Segnale DEBOLE -> prima
                //    aspettiamo chi sta ancora risolvendo i metadata, altrimenti
                //    incoroniamo chi ha risposto per primo invece del migliore.
                //    Un magnet morto non ci costa nulla: resta `pending`, ma il ramo
                //    forte lo scavalca e comunque raceMs chiude tutto.
                const bestM = metricsOf(lastStats.get(best.hash));
                const pending = racers.some((c) => !metricsOf(lastStats.get(c.hash)).metadata);
                const mayTrustWeakSignal = !pending || elapsed >= T.metadataGraceMs;
                if (isVeryStrongM(bestM) || (mayTrustWeakSignal && hasHealthySwarmM(bestM))) { settle(best, 'strong', elapsed); return; }
                // 3) Finestra scaduta -> verdetto (vedi decideAtTimeout).
                if (elapsed >= T.raceMs) { decideAtTimeout(elapsed); return; }
                // 4) Continua a correre.
                setTimeout(tick, T.pollMs);
            });
        };
        // I reader partono PRIMA del primo poll: avviandoli in parallelo, i primi
        // tick leggerebbero le misure di torrent non ancora avviati e a
        // UNREACHABLE_MS scatterebbe un fail-open che non c'entra nulla.
        startProbes(hashes, se, T.postTimeoutMs).then(tick);
    });
};

module.exports = {
    raceTorrents, hashFromUrl, seFromUrl,
    RACE_K, RACE_MS, MIN_RACE_MS, METADATA_GRACE_MS, MIN_WIN_SPEED, STRONG_SPEED,
    scoreOf, isStrongM, isVeryStrongM, hasHealthySwarmM, hasMovedBytes,
    metricsOf, emptyEvidence, foldEvidence, raceStepState
};
