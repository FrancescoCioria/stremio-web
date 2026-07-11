// Test della logica di selezione della race "Auto" (torrentRace.js).
//
// Due famiglie di regressioni sono ancorate qui:
//   - 2026-07-09: la race incorono' `dcb3ff...` (3 seeder, ~131 KB/s) scartando
//     `11970d52...` (sano, metadata lenti a risolvere) e il player resto' appeso.
//   - 2026-07-11: la race misurava torrent che NESSUNO stava leggendo (TorrServer
//     senza reader sta fermo) -> speed ~0 su tutti -> "too-slow" su OGNI race, Auto
//     non incoronava mai nessuno. Ora e' il backend ad aprire i reader e a misurare
//     i byte consegnati; qui si legge /stremio-addon/probe. I test parlano quel
//     contratto: se qualcuno tornasse a parlare direttamente con TorrServer (:8090)
//     dal browser, `fakeBackend` non lo servirebbe e la race fallirebbe fail-open.

const {
    isStrongM, isVeryStrongM, hasHealthySwarmM, hasMovedBytes, scoreOf,
    emptyEvidence, foldEvidence,
    hashFromUrl, seFromUrl, raceTorrents,
    MIN_WIN_SPEED, STRONG_SPEED, raceStepState
} = require('../src/common/torrentRace');

const KB = 1024;
const MB = 1024 * KB;
// Una riga di /stremio-addon/probe. `metadata:false` = il torrent non e' mai
// partito (magnet morto / metadata non risolti) -> non e' selezionabile.
const stat = (o) => Object.assign(
    { hash: 'h', speed: 0, bytes: 0, seeders: 0, peers: 0, metadata: true }, o
);
const m = (o) => Object.assign({ peers: 0, seeders: 0, speed: 0, bytes: 0, metadata: true }, o);

describe('isStrongM', () => {
    it('NON incorona un gocciolamento con tanti seeder (regressione dcb3ff)', () => {
        // 3 seeder connessi ma solo 131 KB/s: prima passava (`speed > 0`).
        expect(isStrongM(m({ seeders: 3, speed: 131 * KB }))).toBe(false);
    });

    it('accetta tanti seeder se il throughput e\' utile', () => {
        expect(isStrongM(m({ seeders: 3, speed: MIN_WIN_SPEED }))).toBe(true);
        expect(isStrongM(m({ seeders: 5, speed: 800 * KB }))).toBe(true);
    });

    it('accetta comunque chi scarica forte, anche con pochi seeder', () => {
        expect(isStrongM(m({ seeders: 1, speed: STRONG_SPEED }))).toBe(true);
    });

    it('non accetta seeder senza byte, ne\' byte scarsi senza seeder', () => {
        expect(isStrongM(m({ seeders: 10, speed: 0 }))).toBe(false);
        expect(isStrongM(m({ seeders: 0, speed: 500 * KB }))).toBe(false);
    });

    it('separa il segnale FORTE dal DEBOLE (hanno tempi di validita\' diversi)', () => {
        const forte = m({ seeders: 1, speed: STRONG_SPEED });
        const debole = m({ seeders: 3, speed: MIN_WIN_SPEED });
        expect(isVeryStrongM(forte)).toBe(true);
        expect(hasHealthySwarmM(forte)).toBe(false); // 1 solo seeder
        expect(isVeryStrongM(debole)).toBe(false);
        expect(hasHealthySwarmM(debole)).toBe(true);
    });
});

describe('hasMovedBytes', () => {
    it('peer connessi che non consegnano nulla NON sono giocabili (regressione)', () => {
        // Prima `isLiveM` diceva true su peers>0 -> vinceva -> spinner infinito.
        const e = foldEvidence(emptyEvidence(), m({ peers: 12, seeders: 4, speed: 0, bytes: 0 }));
        expect(hasMovedBytes(e)).toBe(false);
    });

    it('i byte CONSEGNATI sono la verita\', non la speed', () => {
        // Il backend misura speed = bytes/tempo-di-lettura e la ARROTONDA: un reader
        // che ha consegnato pochi byte in molti secondi legge 0 B/s pur essendo vivo.
        // Il verdetto "giocabile" deve guardare i byte.
        const e = foldEvidence(emptyEvidence(), m({ bytes: 900, speed: 0 }));
        expect(hasMovedBytes(e)).toBe(true);
    });

    it('tiene il PICCO di velocita\', anche se poi lo swarm rallenta', () => {
        let e = foldEvidence(emptyEvidence(), m({ speed: 400 * KB, bytes: 2 * MB }));
        e = foldEvidence(e, m({ speed: 120 * KB, bytes: 3 * MB }));
        expect(e.maxSpeed).toBe(400 * KB);
        expect(hasMovedBytes(e)).toBe(true);
    });

    it('tiene il PICCO di seeder/peer (uno swarm che collassa non sparisce dal log)', () => {
        let e = foldEvidence(emptyEvidence(), m({ seeders: 5, peers: 9 }));
        e = foldEvidence(e, m({ seeders: 0, peers: 0 }));
        expect(e.maxSeeders).toBe(5);
        expect(e.maxPeers).toBe(9);
        expect(e.polls).toBe(2);
    });
});

describe('scoreOf', () => {
    it('un torrent senza misure sta sotto a qualunque altro', () => {
        expect(scoreOf(null)).toBeLessThan(scoreOf(stat({ peers: 1 })));
    });

    it('il throughput reale batte i soli seeder', () => {
        const veloce = stat({ speed: 4 * MB, seeders: 1 });
        const seedato = stat({ speed: 0, seeders: 6 });
        expect(scoreOf(veloce)).toBeGreaterThan(scoreOf(seedato));
    });
});

describe('helper url', () => {
    it('estrae l\'hash dall\'url del nostro addon', () => {
        const u = 'http://100.114.200.47:8765/stremio-addon/ts/dcb3ffc78329955803b15fb70ccb234bb8a71c0b/0';
        expect(hashFromUrl(u)).toBe('dcb3ffc78329955803b15fb70ccb234bb8a71c0b');
    });

    it('hashFromUrl e\' robusto a input non validi', () => {
        expect(hashFromUrl(null)).toBeNull();
        expect(hashFromUrl('http://x/ts/nonhex/0')).toBeNull();
    });

    it('seFromUrl estrae stagione.episodio (serve al backend per il file del season pack)', () => {
        expect(seFromUrl('http://h/stremio-addon/ts/ab/0?se=1.4')).toBe('1.4');
        expect(seFromUrl('http://h/stremio-addon/ts/ab/0')).toBeNull();
        expect(seFromUrl(null)).toBeNull();
    });
});

// --- Race end-to-end, con backend finto e costanti temporali accorciate ------

// Simula il backend: POST /probe avvia i reader, GET ne legge le misure, POST
// /probe/stop ferma i perdenti (beacon).
// ⚠️ Come il backend vero, la GET ritorna SEMPRE una riga per ogni hash richiesto:
// un torrent mai partito e' una riga con `metadata:false`, non una riga assente.
// Un fake piu' "comodo" (che omette le righe) farebbe passare un ritorno al
// vecchio "il backend ha risposto = metadata risolti", che e' il bug originale.
const fakeBackend = (stats) => {
    const calls = [];
    global.window = { location: { hostname: 'beelink' } };
    global.navigator = { sendBeacon: jest.fn((url, blob) => { calls.push({ url, method: 'BEACON', blob }); return true; }) };
    global.Blob = function Blob(parts) { this.parts = parts; };
    global.fetch = jest.fn((url, opts) => {
        const method = (opts && opts.method) || 'GET';
        calls.push({ url, method, body: opts && opts.body ? JSON.parse(opts.body) : null });
        if (method === 'POST') {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ started: 1 }) });
        }
        const hashes = (url.split('hashes=')[1] || '').split(',').filter(Boolean);
        const rows = hashes.map((h) => Object.assign(
            { hash: h, speed: 0, bytes: 0, seeders: 0, peers: 0, metadata: false },
            stats[h] || {}
        ));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ stats: rows }) });
    });
    return calls;
};

// Un torrent che il backend ha davvero misurato (metadata risolti).
const measured = (o) => Object.assign({ metadata: true }, o);
// Un magnet che non e' mai partito: TorrServer non ne ha i metadata.
const DEAD = { metadata: false, speed: 0, bytes: 0 };

const cand = (hash, seeders) => ({ hash, seeders, stream: { url: 'http://h/ts/' + hash + '/0' } });

const TIMING = {
    pollMs: 1, minRaceMs: 5, raceMs: 40, unreachableMs: 3, metadataGraceMs: 20,
    guardMarginMs: 20, postTimeoutMs: 10, getTimeoutMs: 10
};

describe('raceTorrents', () => {
    afterEach(() => { delete global.fetch; delete global.window; });

    it('apre i reader nel BACKEND prima di misurare (regressione 2026-07-11)', async () => {
        // Senza reader TorrServer non scarica: la race misurava zeri e nessuno
        // vinceva mai. Il POST /probe DEVE precedere la prima lettura.
        const calls = fakeBackend({
            good: measured({ speed: 3 * MB, bytes: 12 * MB, seeders: 5 }),
            slow: measured({ speed: 1000, bytes: 4000, seeders: 1 })
        });
        const winner = await raceTorrents({
            candidates: [cand('good', 9), cand('slow', 2)],
            timing: TIMING, onDecision: () => {}
        });
        expect(winner.hash).toBe('good');
        expect(calls[0].method).toBe('POST');
        expect(calls[0].url).toContain('/stremio-addon/probe');
        expect(calls[0].body.hashes).toEqual(['good', 'slow']);
        // Nessuno parla piu' con TorrServer (:8090) dal browser, ne' rimuove torrent.
        expect(calls.some((c) => c.url.includes(':8090'))).toBe(false);
        expect(calls.some((c) => c.body && c.body.action === 'rem')).toBe(false);
    });

    it('propaga stagione.episodio al backend (senza, misurerebbe il file sbagliato)', async () => {
        const calls = fakeBackend({ a: measured({ speed: 3 * MB, bytes: 9 * MB, seeders: 5 }), b: DEAD });
        const withSe = (hash) => ({ hash, seeders: 1, stream: { url: 'http://h/ts/' + hash + '/0?se=2.7' } });
        await raceTorrents({
            candidates: [withSe('a'), withSe('b')], timing: TIMING, onDecision: () => {}
        });
        expect(calls[0].body.se).toBe('2.7');
    });

    it('ritorna null (lista manuale) se nessuno ha consegnato un byte', async () => {
        fakeBackend({
            a: measured({ peers: 8, seeders: 3, speed: 0, bytes: 0 }),
            b: measured({ peers: 2, seeders: 1, speed: 0, bytes: 0 })
        });
        const decisions = [];
        const winner = await raceTorrents({
            candidates: [cand('a', 5), cand('b', 3)],
            timing: TIMING, onDecision: (d) => decisions.push(d)
        });
        expect(winner).toBeNull();
        expect(decisions[0].reason).toBe('no-bytes');
    });

    it('NON incorona un torrent che gocciola: lista manuale (regressione Carolina)', async () => {
        // Il caso esatto del 2026-07-09: dcb3ff consegna byte (131 KB/s) ma non
        // reggerebbe un 1080p; gli altri candidati sono morti. Prima vinceva lui e
        // il player restava appeso per sempre.
        fakeBackend({
            dcb3ff: measured({ speed: 131 * KB, bytes: 2 * MB, seeders: 3, peers: 5 }),
            morto: DEAD
        });
        const decisions = [];
        const winner = await raceTorrents({
            candidates: [cand('dcb3ff', 12), cand('morto', 40)],
            timing: TIMING, onDecision: (d) => decisions.push(d)
        });
        expect(winner).toBeNull();
        expect(decisions[0].reason).toBe('too-slow');
        expect(decisions[0].racers.find((r) => r.hash === 'dcb3ff').maxSpeed).toBe(131 * KB);
    });

    it('incorona chi supera il pavimento anche se la speed poi cala', async () => {
        fakeBackend({
            buono: measured({ speed: 900 * KB, bytes: 8 * MB, seeders: 2 }),
            lento: measured({ speed: 50 * KB, bytes: 200 * KB, seeders: 1 })
        });
        const winner = await raceTorrents({
            candidates: [cand('buono', 3), cand('lento', 30)],
            timing: TIMING, onDecision: () => {}
        });
        expect(winner.hash).toBe('buono');
    });

    it('sul segnale DEBOLE aspetta chi non ha ancora i metadata (regressione 11970d52)', async () => {
        // `mediocre` passa solo per "3 seeder + ritmo decente" (segnale debole);
        // `pending` non ha ancora i metadata. Non si incorona prima della grace.
        fakeBackend({
            mediocre: measured({ speed: 400 * KB, bytes: 4 * MB, seeders: 3 }),
            pending: DEAD
        });
        const decisions = [];
        const winner = await raceTorrents({
            candidates: [cand('mediocre', 4), cand('pending', 40)],
            timing: TIMING, onDecision: (d) => decisions.push(d)
        });
        expect(winner.hash).toBe('mediocre');
        expect(decisions[0].elapsedMs).toBeGreaterThanOrEqual(TIMING.metadataGraceMs);
        expect(decisions[0].racers.find((r) => r.hash === 'pending').metadataResolved).toBe(false);
    });

    it('un magnet morto NON ritarda un torrent inequivocabilmente forte', async () => {
        // Il gate metadata e' globale, quindi un magnet morto (comune) faceva
        // aspettare METADATA_GRACE_MS a ogni play. Chi scarica >= STRONG_SPEED
        // deve partire alla finestra minima.
        fakeBackend({
            fortissimo: measured({ speed: 3 * MB, bytes: 20 * MB, seeders: 8 }),
            morto: DEAD
        });
        const decisions = [];
        const winner = await raceTorrents({
            candidates: [cand('fortissimo', 20), cand('morto', 50)],
            timing: TIMING, onDecision: (d) => decisions.push(d)
        });
        expect(winner.hash).toBe('fortissimo');
        expect(decisions[0].reason).toBe('strong');
        expect(decisions[0].elapsedMs).toBeLessThan(TIMING.metadataGraceMs);
    });

    it('fail-open al piu\' seedato se il backend non risponde', async () => {
        global.window = { location: { hostname: 'beelink' } };
        global.fetch = jest.fn(() => Promise.reject(new Error('down')));
        const winner = await raceTorrents({
            candidates: [cand('primo', 50), cand('secondo', 10)],
            timing: TIMING, onDecision: () => {}
        });
        expect(winner.hash).toBe('primo');
    });

    it('una fetch che non risponde MAI non appende la race (guardia)', async () => {
        // Backend in restart / WiFi del box in crash-loop: la connessione resta
        // appesa. Senza un timer di guardia la promise non si settlava piu' e le
        // card qualita' smettevano di rispondere ai click (`if (racing) return`).
        global.window = { location: { hostname: 'beelink' } };
        global.navigator = { sendBeacon: jest.fn() };
        global.Blob = function Blob() {};
        global.fetch = jest.fn(() => new Promise(() => {})); // non si risolve mai
        const winner = await raceTorrents({
            candidates: [cand('primo', 50), cand('secondo', 10)],
            timing: TIMING, onDecision: () => {}
        });
        expect(winner.hash).toBe('primo'); // fail-open, come col backend giu'
    });

    it('appena c\'e\' un vincitore, FERMA i reader dei perdenti', async () => {
        // Continuare a leggere 3 torrent mentre il player apre il vincitore gli ruba
        // banda e connessioni TorrServer proprio nel momento peggiore.
        const calls = fakeBackend({
            vince: measured({ speed: 3 * MB, bytes: 20 * MB, seeders: 8 }),
            perde: measured({ speed: 10 * KB, bytes: 50 * KB, seeders: 1 })
        });
        const winner = await raceTorrents({
            candidates: [cand('vince', 9), cand('perde', 2)],
            timing: TIMING, onDecision: () => {}
        });
        expect(winner.hash).toBe('vince');
        const stop = calls.find((c) => c.method === 'BEACON' && c.url.includes('/probe/stop'));
        expect(stop).toBeDefined();
        expect(JSON.parse(stop.blob.parts[0]).hashes).toEqual(['perde']); // MAI il vincitore
    });

    it('un solo candidato: lo scalda e lo ritorna senza correre', async () => {
        const calls = fakeBackend({ solo: {} });
        const decisions = [];
        const winner = await raceTorrents({
            candidates: [cand('solo', 1)], timing: TIMING, onDecision: (d) => decisions.push(d)
        });
        expect(winner.hash).toBe('solo');
        expect(decisions[0].reason).toBe('single');
        // Scaldato (POST), ma nessuna misura letta: non c'e' nulla da scegliere.
        expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
        expect(calls.filter((c) => c.method === 'GET')).toHaveLength(0);
    });
});

describe('raceStepState (steppino UI per torrent)', () => {
    const withBytes = (kb) => foldEvidence(emptyEvidence(), m({ speed: kb * KB, bytes: kb * KB }));

    it('metadata non risolti -> pending (il torrent non puo\' partire)', () => {
        expect(raceStepState(false, emptyEvidence(), false)).toBe('pending');
    });
    it('metadata risolti ma zero byte -> alive', () => {
        expect(raceStepState(true, emptyEvidence(), false)).toBe('alive');
    });
    it('sta consegnando byte -> downloading', () => {
        expect(raceStepState(true, withBytes(500), false)).toBe('downloading');
    });
    it('vincitore -> winner, a prescindere dallo stato', () => {
        expect(raceStepState(true, withBytes(500), true)).toBe('winner');
        expect(raceStepState(false, emptyEvidence(), true)).toBe('winner');
    });
});
