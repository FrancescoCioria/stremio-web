// Test della scorta buffer del client (casaClientBuffer.js).
//
// Ancorato alla serata del 11/08/2026: il pannello diceva "Buffer: 67m 54s"
// (= 61,46% della cache TorrServer moltiplicato per la durata) mentre il client
// aveva 18 secondi e il film si fermava. Il numero giusto viene dal browser.

const { bufferAheadMs } = require('../src/routes/Player/casaClientBuffer');

describe('bufferAheadMs', () => {
    it('scorta = fine del buffer meno la testina', () => {
        expect(bufferAheadMs(2100000, 2076000)).toBe(24000);
    });

    it('buffer vuoto (il caso degli stop): zero, non null', () => {
        expect(bufferAheadMs(3204000, 3204000)).toBe(0);
    });

    it('mai negativo: dopo un seek in avanti buffered resta indietro per qualche frame', () => {
        expect(bufferAheadMs(3204000, 3210000)).toBe(0);
    });

    it('player che carica o stream scaricato: null, cosi il pannello mostra --', () => {
        expect(bufferAheadMs(null, 1000)).toBe(null);
        expect(bufferAheadMs(1000, null)).toBe(null);
        expect(bufferAheadMs(null, null)).toBe(null);
        expect(bufferAheadMs(undefined, 1000)).toBe(null);
    });

    it('valori non finiti non passano (NaN si propagherebbe nella UI)', () => {
        expect(bufferAheadMs(NaN, 1000)).toBe(null);
        expect(bufferAheadMs(1000, NaN)).toBe(null);
        expect(bufferAheadMs(Infinity, 1000)).toBe(null);
    });

    it('un buffer da 5 minuti (target hls.js) passa senza cap', () => {
        expect(bufferAheadMs(300000 + 60000, 60000)).toBe(300000);
    });
});
