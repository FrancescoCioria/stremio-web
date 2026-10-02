const { fragRecoveryStep, initialMemory, MAX_SKIPS } = require('../vendor/stremio-video/src/HTMLVideo/casaFragRecovery');

const err = (time, frag) => ({ kind: 'error', time, frag: { type: 'main', sn: 403, start: 4024.02, end: 4034.03, ...frag } });
const run = (memory, inputs) => inputs.reduce((acc, i) => {
    const s = fragRecoveryStep(acc.memory, i);
    return { memory: s.memory, actions: acc.actions.concat([s.action]) };
}, { memory, actions: [] });

describe('fragRecoveryStep', () => {
    test('Superman 02/10: segmento lontano con 197 s di buffer -> si ritenta, mai salto', () => {
        const { actions } = run(initialMemory(), [err(3827.5), err(3840), err(3860), err(3900), err(3950)]);
        expect(actions.map((a) => a.type)).toEqual(['retry', 'retry', 'retry', 'retry', 'retry']);
        expect(actions.map((a) => a.delayMs)).toEqual([4000, 8000, 16000, 30000, 30000]);
    });

    test('arrivati al buco: un ultimo tentativo, poi salto oltre la fine del segmento', () => {
        const { actions } = run(initialMemory(), [err(4024.2), err(4026.3)]);
        expect(actions[0]).toEqual({ type: 'retry', delayMs: 2000 });
        expect(actions[1].type).toBe('skip');
        expect(actions[1].to).toBeCloseTo(4034.13, 5);
    });

    test('salto mai all\'indietro: testina gia\' oltre la fine del frammento', () => {
        const { actions } = run(initialMemory(), [err(4035), err(4035)]);
        expect(actions[1].to).toBeCloseTo(4035.1, 5);
    });

    test('fonte morta: dopo MAX_SKIPS salti senza un frammento caricato ci si ferma', () => {
        const inputs = [];
        for (let i = 0; i <= MAX_SKIPS; i++) {
            const start = 4024.02 + 10 * i;
            const f = { sn: 403 + i, start, end: start + 10.01 };
            inputs.push(err(start, f), err(start, f));
        }
        const { actions } = run(initialMemory(), inputs);
        const types = actions.filter((a, i) => i % 2 === 1).map((a) => a.type);
        expect(types).toEqual(['skip', 'skip', 'skip', 'give-up']);
    });

    test('un frammento caricato della STESSA traccia riarma i salti', () => {
        let m = initialMemory();
        for (let i = 0; i < MAX_SKIPS; i++) {
            const f = { sn: 403 + i };
            m = run(m, [err(4024.2, f), err(4024.2, f)]).memory;
        }
        m = fragRecoveryStep(m, { kind: 'loaded', type: 'main' }).memory;
        const { actions } = run(m, [err(4100, { sn: 500, start: 4100, end: 4110 }), err(4100, { sn: 500, start: 4100, end: 4110 })]);
        expect(actions[1].type).toBe('skip');
    });

    test('NEGATIVO: l\'audio che carica NON riarma i salti del video (video morto, audio sano)', () => {
        let m = initialMemory();
        for (let i = 0; i < MAX_SKIPS; i++) {
            const f = { sn: 403 + i };
            m = run(m, [err(4024.2, f), err(4024.2, f)]).memory;
            m = fragRecoveryStep(m, { kind: 'loaded', type: 'audio' }).memory;
        }
        const f = { sn: 600, start: 4060, end: 4070 };
        const { actions } = run(m, [err(4060, f), err(4060, f)]);
        expect(actions[1].type).toBe('give-up');
    });

    test('NEGATIVO: l\'ultimo tentativo e\' uno per frammento, non si riarma', () => {
        let m = run(initialMemory(), [err(4024.2)]).memory;
        m = fragRecoveryStep(m, { kind: 'loaded', type: 'audio' }).memory;
        m = fragRecoveryStep(m, { kind: 'loaded', type: 'main' }).memory;
        expect(fragRecoveryStep(m, err(4024.2)).action.type).toBe('skip');
    });

    test('NEGATIVO: sottotitoli e input malformati non fanno niente', () => {
        expect(fragRecoveryStep(initialMemory(), err(10, { type: 'subtitle' })).action).toBeNull();
        expect(fragRecoveryStep(initialMemory(), { kind: 'error', time: 10, frag: null }).action).toBeNull();
        expect(fragRecoveryStep(initialMemory(), err(10, { start: undefined })).action).toBeNull();
    });
    test('attesa del ritento mai oltre il buffer rimasto (review 02/10)', () => {
        let m = initialMemory();
        for (let i = 0; i < 4; i++) m = fragRecoveryStep(m, err(3800)).memory;   // backoff gia' a 30 s
        // frammento 23 s avanti, soglia 3 s: 20 s prima di esserci sotto -> attesa 20 s, non 30.
        expect(fragRecoveryStep(m, err(4001.02)).action).toEqual({ type: 'retry', delayMs: 20000 });
        // a velocita' 2 lo stesso tratto dura la meta' in tempo reale.
        expect(fragRecoveryStep(m, { ...err(4001.02), rate: 2 }).action.delayMs).toBe(10000);
    });

    test('NEGATIVO: l\'audio che carica NON azzera l\'attesa crescente del video', () => {
        let m = run(initialMemory(), [err(3800), err(3800)]).memory;
        m = fragRecoveryStep(m, { kind: 'loaded', type: 'audio' }).memory;
        expect(fragRecoveryStep(m, err(3800)).action.delayMs).toBe(16000);
    });
});

