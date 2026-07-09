// Test della logica di selezione della race "Auto" (torrentRace.js).
// I casi negativi sono ancorati all'incidente 2026-07-09: la race incorono'
// `dcb3ff...` (3 seeder, ~131 KB/s) scartando `11970d52...` (sano, metadata
// lenti a risolvere) e il player resto' appeso per sempre.

const {
    isStrongM, isVeryStrongM, hasHealthySwarmM, hasMovedBytes, scoreOf,
    emptyEvidence, foldEvidence,
    hashFromUrl, torrserverBase, trackersOf, raceTorrents,
    MIN_WIN_SPEED, STRONG_SPEED
} = require('../src/common/torrentRace');

const KB = 1024;
const m = (o) => Object.assign({ peers: 0, seeders: 0, speed: 0, preloaded: 0 }, o);

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
        const e = foldEvidence(emptyEvidence(), m({ peers: 12, seeders: 4, speed: 0 }));
        expect(hasMovedBytes(e)).toBe(false);
    });

    it('un solo poll con byte basta, anche se poi la speed torna a 0', () => {
        let e = foldEvidence(emptyEvidence(), m({ speed: 400 * KB }));
        e = foldEvidence(e, m({ speed: 0 }));
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

    it('la cache preloaded conta come byte mossi', () => {
        expect(hasMovedBytes(foldEvidence(emptyEvidence(), m({ preloaded: 1 })))).toBe(true);
    });
});

describe('scoreOf', () => {
    it('un torrent senza stats sta sotto a qualunque altro', () => {
        expect(scoreOf(null)).toBeLessThan(scoreOf({ active_peers: 1 }));
    });

    it('il throughput reale batte i soli seeder', () => {
        const veloce = { download_speed: 4 * 1024 * 1024, connected_seeders: 1 };
        const seedato = { download_speed: 0, connected_seeders: 6 };
        expect(scoreOf(veloce)).toBeGreaterThan(scoreOf(seedato));
    });
});

describe('helper url', () => {
    it('estrae hash e base dall\'url del nostro addon', () => {
        const u = 'http://100.114.200.47:8765/stremio-addon/ts/dcb3ffc78329955803b15fb70ccb234bb8a71c0b/0';
        expect(hashFromUrl(u)).toBe('dcb3ffc78329955803b15fb70ccb234bb8a71c0b');
        expect(torrserverBase(u)).toBe('http://100.114.200.47:8090');
    });

    it('hashFromUrl e\' robusto a input non validi', () => {
        expect(hashFromUrl(null)).toBeNull();
        expect(hashFromUrl('http://x/ts/nonhex/0')).toBeNull();
        expect(torrserverBase('non-un-url')).toBeNull();
    });

    it('trackersOf estrae solo i sources tracker:', () => {
        expect(trackersOf({ sources: ['tracker:udp://a:1', 'dht:xyz'] })).toEqual(['udp://a:1']);
        expect(trackersOf({})).toEqual([]);
    });
});

// --- Race end-to-end, con fetch finto e costanti temporali accorciate --------

// Simula TorrServer: `stats[hash]` = stato ritornato da action:get (null = il
// torrent non ha mai risolto i metadata, come 11970d52 nell'incidente).
const fakeTorrserver = (stats) => {
    const calls = [];
    global.fetch = jest.fn((url, opts) => {
        const body = JSON.parse(opts.body);
        calls.push(body);
        if (body.action === 'add') return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        if (body.action === 'get') {
            const t = stats[body.hash];
            return Promise.resolve({ ok: true, json: () => Promise.resolve(t || null) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
    });
    return calls;
};

const cand = (hash, seeders) => ({
    hash, seeders, base: 'http://ts:8090', trackers: [], stream: { url: 'u/' + hash }
});

const TIMING = { pollMs: 1, minRaceMs: 5, raceMs: 40, unreachableMs: 3, metadataGraceMs: 20 };

describe('raceTorrents', () => {
    afterEach(() => { delete global.fetch; });

    it('NON rimuove mai i perdenti (ucciderebbe il reader di un altro client)', async () => {
        const calls = fakeTorrserver({
            good: { download_speed: 3 * 1024 * 1024, connected_seeders: 5 },
            slow: { download_speed: 1000, connected_seeders: 1 }
        });
        const winner = await raceTorrents({
            candidates: [cand('good', 9), cand('slow', 2)],
            timing: TIMING, onDecision: () => {}
        });
        expect(winner.hash).toBe('good');
        expect(calls.some((c) => c.action === 'rem')).toBe(false);
    });

    it('ritorna null (lista manuale) se nessuno ha mosso un byte', async () => {
        fakeTorrserver({
            a: { active_peers: 8, connected_seeders: 3, download_speed: 0 },
            b: { active_peers: 2, connected_seeders: 1, download_speed: 0 }
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
        // Il caso esatto del 2026-07-09: dcb3ff muove byte (131 KB/s) ma non
        // reggerebbe un 1080p; gli altri candidati sono morti. Prima vinceva lui e
        // il player restava appeso per sempre.
        fakeTorrserver({
            dcb3ff: { download_speed: 131 * KB, connected_seeders: 3, active_peers: 5 },
            morto: null
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
        fakeTorrserver({
            buono: { download_speed: 900 * KB, connected_seeders: 2 },
            lento: { download_speed: 50 * KB, connected_seeders: 1 }
        });
        const winner = await raceTorrents({
            candidates: [cand('buono', 3), cand('lento', 30)],
            timing: TIMING, onDecision: () => {}
        });
        expect(winner.hash).toBe('buono');
    });

    it('sul segnale DEBOLE aspetta chi non ha ancora i metadata (regressione 11970d52)', async () => {
        // `mediocre` passa solo per "3 seeder + ritmo decente" (segnale debole);
        // `pending` non risponde mai. Non si incorona prima della grace.
        fakeTorrserver({
            mediocre: { download_speed: 400 * KB, connected_seeders: 3 },
            pending: null
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
        // Regressione trovata in review: il gate metadata e' globale, quindi un
        // magnet morto (comune) faceva aspettare METADATA_GRACE_MS a ogni play.
        // Chi scarica >= STRONG_SPEED deve partire alla finestra minima.
        fakeTorrserver({
            fortissimo: { download_speed: 3 * 1024 * 1024, connected_seeders: 8 },
            morto: null
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

    it('il candidato singolo bypassa i controlli ma emette telemetria', async () => {
        fakeTorrserver({ solo: {} });
        const decisions = [];
        const winner = await raceTorrents({
            candidates: [cand('solo', 1)], timing: TIMING, onDecision: (d) => decisions.push(d)
        });
        expect(winner.hash).toBe('solo');
        expect(decisions[0].reason).toBe('single');
    });

    it('fail-open al piu\' seedato se TorrServer non risponde', async () => {
        global.fetch = jest.fn(() => Promise.reject(new Error('down')));
        const winner = await raceTorrents({
            candidates: [cand('primo', 50), cand('secondo', 10)],
            timing: TIMING, onDecision: () => {}
        });
        expect(winner.hash).toBe('primo');
    });

    it('un solo candidato: lo scalda e lo ritorna senza correre', async () => {
        const calls = fakeTorrserver({ solo: {} });
        const winner = await raceTorrents({ candidates: [cand('solo', 1)], timing: TIMING, onDecision: () => {} });
        expect(winner.hash).toBe('solo');
        expect(calls.filter((c) => c.action === 'get')).toHaveLength(0);
    });
});
