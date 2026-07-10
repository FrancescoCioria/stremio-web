// Logica pura dello slider "Cache size" (0-60GB step 5) — CacheSizeSlider.
// La resa/nav del componente vuole uno streaming-server connesso (settings
// Ready) quindi non e' headless: qui si testa la logica, il resto e' rivisto sul
// codice (vedi CacheSizeSlider.tsx + docs/stremio-torrserver.md).
const {
    bytesToGb, gbToBytes, gbLabel, nextGbForKey, MAX, GiB,
} = require('../src/routes/Settings/Streaming/cacheSize');

describe('bytesToGb', () => {
    it('snappa allo step di 5GB', () => {
        expect(bytesToGb(40 * GiB)).toBe(40);
        expect(bytesToGb(0)).toBe(0);
        expect(bytesToGb(3 * GiB)).toBe(5);   // 0.6 -> 5
        expect(bytesToGb(2 * GiB)).toBe(0);   // 0.4 -> 0
        expect(bytesToGb(12 * GiB)).toBe(10); // 2.4 -> 10
        expect(bytesToGb(13 * GiB)).toBe(15); // 2.6 -> 15
    });
    it('null/undefined/invalido (infinito) -> MAX', () => {
        expect(bytesToGb(null)).toBe(MAX);
        expect(bytesToGb(undefined)).toBe(MAX);
        expect(bytesToGb(Infinity)).toBe(MAX);
    });
    it('clamp oltre il massimo', () => {
        expect(bytesToGb(200 * GiB)).toBe(60);
    });
});

describe('gbLabel / gbToBytes', () => {
    it('0 = No caching, altrimenti N GiB', () => {
        expect(gbLabel(0)).toBe('No caching');
        expect(gbLabel(40)).toBe('40 GiB');
    });
    it('gbToBytes round-trip con clamp', () => {
        expect(gbToBytes(40)).toBe(40 * GiB);
        expect(gbToBytes(0)).toBe(0);
        expect(gbToBytes(999)).toBe(60 * GiB); // clamp
    });
});

describe('nextGbForKey (nav telecomando)', () => {
    it('ArrowRight = +5 fino a 60', () => {
        expect(nextGbForKey('ArrowRight', 35)).toBe(40);
        expect(nextGbForKey('ArrowRight', 60)).toBe(60); // cap, non oltre
    });
    it('ArrowLeft = -5 fino a 0', () => {
        expect(nextGbForKey('ArrowLeft', 5)).toBe(0);
        expect(nextGbForKey('ArrowLeft', 0)).toBe(0); // floor
    });
    it('altri tasti -> null (↑/↓ devono passare alla spatial-nav)', () => {
        expect(nextGbForKey('ArrowUp', 30)).toBeNull();
        expect(nextGbForKey('ArrowDown', 30)).toBeNull();
        expect(nextGbForKey('Enter', 30)).toBeNull();
        expect(nextGbForKey('Tab', 30)).toBeNull();
    });
});
