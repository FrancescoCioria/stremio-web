// Test dell'accelerazione dei seek concatenati (casaSeekAccel.js).
//
// Ancorato alla serata del 2026-09-13: freccia destra tenuta ~30s per
// arrivare a 30 minuti (10s ogni 180ms, passo costante). I tocchi singoli
// devono restare precisi; solo la catena accelera.

const { nextSeek, initialSeekChain, multiplierFor, CHAIN_MS } = require('../src/common/casaSeekAccel');

const STEP = 10000;
const DURATION = 3240320; // Silo S03E06

// Simula N pressioni a intervallo fisso; il player NON aggiorna `time` fra una
// e l'altra (e' il caso reale: la conferma arriva dopo il render).
const press = (n, { direction = 1, interval = 180, time = 0, start = 1000, chain = initialSeekChain() } = {}) => {
    let c = chain;
    let target = null;
    for (let i = 0; i < n; i++) {
        ({ target, chain: c } = nextSeek({ direction, step: STEP, time, duration: DURATION, now: start + i * interval, chain: c }));
    }
    return { target, chain: c };
};

describe('nextSeek', () => {
    it('tocco singolo: un passo base dal tempo del player, nessuna accelerazione', () => {
        const r = nextSeek({ direction: 1, step: STEP, time: 60000, duration: DURATION, now: 1000, chain: initialSeekChain() });
        expect(r.target).toBe(70000);
        expect(r.chain.count).toBe(1);
    });

    it('i primi 3 tocchi in catena restano al passo base (precisione)', () => {
        expect(press(3).target).toBe(3 * STEP);
    });

    it('la catena parte dal bersaglio precedente, non dal tempo (stale) del player', () => {
        // Con time fermo a 0, senza catena ogni pressione darebbe sempre 10s.
        expect(press(2).target).toBe(2 * STEP);
    });

    it('accelera: 4-8 = 2x, 9-15 = 4x, 16+ = 8x', () => {
        expect(multiplierFor(3)).toBe(1);
        expect(multiplierFor(4)).toBe(2);
        expect(multiplierFor(8)).toBe(2);
        expect(multiplierFor(9)).toBe(4);
        expect(multiplierFor(15)).toBe(4);
        expect(multiplierFor(16)).toBe(8);
        expect(multiplierFor(100)).toBe(8);
        // 3x10 + 5x20 + 7x40 = 410s dopo 15 tocchi
        expect(press(15).target).toBe(410000);
    });

    it('30 minuti in meno di 40 tocchi (~7s di pressione a 180ms)', () => {
        const r = press(40);
        expect(r.target).toBeGreaterThanOrEqual(30 * 60 * 1000);
    });

    it('al ritmo del tasto avanti del telecomando (350ms) la catena regge', () => {
        expect(press(5, { interval: 350 }).target).toBe(3 * STEP + 2 * 2 * STEP);
    });

    it('una pausa oltre CHAIN_MS spezza la catena: si riparte dal tempo del player al passo base', () => {
        const a = press(10);
        const r = nextSeek({ direction: 1, step: STEP, time: 500000, duration: DURATION, now: a.chain.at + CHAIN_MS + 1, chain: a.chain });
        expect(r.target).toBe(510000);
        expect(r.chain.count).toBe(1);
    });

    it('cambio di direzione spezza la catena: indietro parte dal tempo del player', () => {
        const a = press(10); // avanti, accelerato
        const r = nextSeek({ direction: -1, step: STEP, time: 200000, duration: DURATION, now: a.chain.at + 100, chain: a.chain });
        expect(r.target).toBe(190000);
        expect(r.chain.count).toBe(1);
    });

    it('indietro accelera allo stesso modo e non scende sotto zero', () => {
        const r = press(40, { direction: -1, time: 60000 });
        expect(r.target).toBe(0);
    });

    it('avanti non supera la durata', () => {
        const r = press(200);
        expect(r.target).toBe(DURATION);
    });

    it('durata sconosciuta: nessun clamp superiore, nessuna eccezione', () => {
        const r = nextSeek({ direction: 1, step: STEP, time: 0, duration: null, now: 1000, chain: initialSeekChain() });
        expect(r.target).toBe(STEP);
    });

    it('chain assente (primo uso): equivale a initialSeekChain', () => {
        const r = nextSeek({ direction: 1, step: STEP, time: 0, duration: DURATION, now: 1000, chain: null });
        expect(r.target).toBe(STEP);
        expect(r.chain.count).toBe(1);
    });
});
