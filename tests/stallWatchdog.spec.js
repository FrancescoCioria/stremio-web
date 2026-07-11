// Test del rilevatore di stallo del player (useStallWatchdog.js).
//
// Ancorato all'incidente 2026-07-11: hls.js carica il primo frammento e non
// chiede piu' nulla — nessun errore, buffer vuoto, player appeso in `buffering`
// per ORE (a monte era tutto sano). Il watchdog deve accorgersene e ricaricare;
// ma NON deve scambiare un torrent lento (buffering con tempo che avanza) per
// uno stallo, ne' accanirsi in un loop di ricariche.

const { stallWatchdogStep, initialMemory, STALL_WINDOWS_MS } = require('../src/routes/Player/useStallWatchdog');

const T0 = 1000000;

// Avanza nel tempo mantenendo lo stato dato; ritorna memoria finale + ricariche.
const advance = (state, memory, fromMs, forMs, stepMs = 5000) => {
    let mem = memory;
    let reloads = 0;
    for (let t = fromMs; t <= fromMs + forMs; t += stepMs) {
        const r = stallWatchdogStep(state, mem, t);
        mem = r.memory;
        if (r.reload) reloads++;
    }
    return { memory: mem, reloads };
};

describe('stallWatchdogStep', () => {
    it('video che scorre: nessuna ricarica', () => {
        let mem = initialMemory();
        let reloads = 0;
        for (let i = 0; i < 100; i++) {
            const r = stallWatchdogStep({ loaded: true, buffering: false, time: i * 1000 }, mem, T0 + i * 5000);
            mem = r.memory;
            if (r.reload) reloads++;
        }
        expect(reloads).toBe(0);
    });

    it('buffering ma il tempo avanza (torrent lento, NON stallo): nessuna ricarica', () => {
        let mem = initialMemory();
        let reloads = 0;
        for (let i = 0; i < 60; i++) {
            const r = stallWatchdogStep({ loaded: true, buffering: true, time: i * 500 }, mem, T0 + i * 5000);
            mem = r.memory;
            if (r.reload) reloads++;
        }
        expect(reloads).toBe(0);
    });

    it('stream non ancora caricato: nessuna ricarica', () => {
        const { reloads } = advance({ loaded: false, buffering: true, time: null }, initialMemory(), T0, 10 * 60 * 1000);
        expect(reloads).toBe(0);
    });

    it('stallo vero: non ricarica PRIMA della finestra', () => {
        const stuck = { loaded: true, buffering: true, time: 1862971 };
        const mem = stallWatchdogStep(stuck, initialMemory(), T0).memory;
        const { reloads } = advance(stuck, mem, T0 + 5000, STALL_WINDOWS_MS[0] - 10000);
        expect(reloads).toBe(0);
    });

    it('stallo vero: ricarica una volta superata la finestra', () => {
        const stuck = { loaded: true, buffering: true, time: 1862971 };
        const mem = stallWatchdogStep(stuck, initialMemory(), T0).memory;
        const { reloads } = advance(stuck, mem, T0, STALL_WINDOWS_MS[0] + 10000);
        expect(reloads).toBe(1);
    });

    it('non si accanisce: al massimo MAX_ATTEMPTS ricariche su uno stallo infinito', () => {
        const stuck = { loaded: true, buffering: true, time: 42 };
        const mem = stallWatchdogStep(stuck, initialMemory(), T0).memory;
        const { reloads } = advance(stuck, mem, T0, 60 * 60 * 1000);
        expect(reloads).toBe(STALL_WINDOWS_MS.length);
    });

    it('la riproduzione riuscita azzera i tentativi', () => {
        const stuck = { loaded: true, buffering: true, time: 10 };
        const mem = stallWatchdogStep(stuck, initialMemory(), T0).memory;
        const stalled = advance(stuck, mem, T0, STALL_WINDOWS_MS[0] + 10000);
        expect(stalled.reloads).toBe(1);
        expect(stalled.memory.attempts).toBe(1);

        const playing = stallWatchdogStep({ loaded: true, buffering: false, time: 20 }, stalled.memory, T0 + 200000);
        expect(playing.memory.attempts).toBe(0);
    });
});
