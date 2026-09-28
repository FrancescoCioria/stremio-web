jest.mock('stremio/common/casaBackend', () => ({ casaBeacon: () => {} }), { virtual: true });
const { frontFrozen, deriveStatus } = require('../src/routes/Player/useSubtitleDebugLog');

const track = (maxEndMs, cues) => ({ i: 0, mode: 'showing', cues, maxEndMs });
// Avanza il playhead campione dopo campione, come il sampler del player.
const run = (samples) => {
    let front = null; let frozen = false;
    samples.forEach(([timeMs, t]) => { const r = frontFrozen(front, t, timeMs, true); front = r.front; frozen = r.frozen; });
    return frozen;
};

describe('CUE_FRONT_FROZEN', () => {
    it('fronte fermo per 60s di film + cue che calano = congelato', () => {
        expect(run([[100000, track(160000, 40)], [130000, track(160000, 35)], [161000, track(160000, 30)]])).toBe(true);
    });
    it('scena senza dialoghi: fronte fermo ma cue NON calano = non congelato', () => {
        expect(run([[100000, track(160000, 40)], [161000, track(160000, 40)]])).toBe(false);
    });
    it('il fronte avanza = si riparte da zero', () => {
        expect(run([[100000, track(160000, 40)], [150000, track(170000, 35)], [175000, track(170000, 30)]])).toBe(false);
    });
    it('seek all\'indietro = si riparte da zero', () => {
        expect(run([[100000, track(160000, 40)], [50000, track(160000, 30)], [100000, track(160000, 20)]])).toBe(false);
    });
    it('deriveStatus lo riporta solo lontano dalla fine', () => {
        const base = { selEmbeddedIdx: 0, selExtra: null, tracks: [track(300000, 10)], timeMs: 100000, durMs: 2000000, playing: true };
        expect(deriveStatus({ ...base, frozen: true })).toBe('CUE_FRONT_FROZEN');
        expect(deriveStatus({ ...base, frozen: false })).toBe('ok');
        expect(deriveStatus({ ...base, durMs: 105000, frozen: true })).toBe('ok');
    });
});
