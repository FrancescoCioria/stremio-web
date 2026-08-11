// Test del recupero dall'errore di decodifica (casaDecodeRecovery.js).
//
// Ancorato ai due crash del 10-11/08/2026 su "Backrooms" 2160p HEVC: il decoder
// del browser molla a meta' film con il buffer PIENO, e oggi l'unica cura e'
// uscire e rientrare a mano. Il recupero deve ricaricare dallo stesso punto, ma
// NON deve ritentare cio' che non puo' riuscire (stream non supportato) ne'
// accanirsi in un loop se il crash si ripresenta subito.

const { decodeRecoveryStep, initialMemory, MAX_ATTEMPTS } = require('../src/routes/Player/casaDecodeRecovery');

const decodeError = () => ({ code: 82, message: 'Error occurred when decoding', critical: true });

describe('decodeRecoveryStep', () => {
    it('errore di decodifica critico: recupera, primo tentativo', () => {
        const r = decodeRecoveryStep(decodeError(), initialMemory());
        expect(r.recover).toBe(true);
        expect(r.attempt).toBe(1);
        expect(r.memory.attempts).toBe(1);
    });

    it('stream non supportato (83): NON ritenta, ricaricare non potrebbe riuscire', () => {
        const r = decodeRecoveryStep({ code: 83, critical: true }, initialMemory());
        expect(r.recover).toBe(false);
        expect(r.memory.attempts).toBe(0);
    });

    it('errore di rete (81): NON ritenta, se ne occupa hls.js', () => {
        const r = decodeRecoveryStep({ code: 81, critical: true }, initialMemory());
        expect(r.recover).toBe(false);
    });

    it('errore 82 NON critico: nessun recupero (il player non ha scaricato lo stream)', () => {
        const r = decodeRecoveryStep({ code: 82, critical: false }, initialMemory());
        expect(r.recover).toBe(false);
    });

    it('errore assente o malformato: nessun recupero, nessuna eccezione', () => {
        expect(decodeRecoveryStep(null, initialMemory()).recover).toBe(false);
        expect(decodeRecoveryStep(undefined, initialMemory()).recover).toBe(false);
        expect(decodeRecoveryStep({}, initialMemory()).recover).toBe(false);
    });

    it('cap: dopo MAX_ATTEMPTS recuperi si molla e torna visibile il layer di errore', () => {
        let mem = initialMemory();
        let recoveries = 0;

        for (let i = 0; i < MAX_ATTEMPTS + 5; i++) {
            const r = decodeRecoveryStep(decodeError(), mem);
            mem = r.memory;
            if (r.recover) recoveries++;
        }

        expect(recoveries).toBe(MAX_ATTEMPTS);
        expect(mem.attempts).toBe(MAX_ATTEMPTS);
    });

    it('il conto riparte da zero con una memoria nuova (= altro stream)', () => {
        let mem = initialMemory();
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            mem = decodeRecoveryStep(decodeError(), mem).memory;
        }
        expect(decodeRecoveryStep(decodeError(), mem).recover).toBe(false);
        expect(decodeRecoveryStep(decodeError(), initialMemory()).recover).toBe(true);
    });

    it('non muta la memoria passata', () => {
        const mem = initialMemory();
        decodeRecoveryStep(decodeError(), mem);
        expect(mem.attempts).toBe(0);
    });
});
