// Misura dei loghi scuri (casaLogoTone.js): canale piu' acceso, non luminanza.

const { logoValue, isDarkLogo } = require('../src/common/casaLogoTone');

// RGBA di n pixel uguali + m trasparenti.
const px = (rgba, n, m = 0) => Uint8ClampedArray.from([
    ...Array.from({ length: n }, () => rgba).flat(),
    ...Array.from({ length: m }, () => [0, 0, 0, 0]).flat(),
]);

describe('logoValue / isDarkLogo', () => {
    it('logo nero (NOCTURNE) = scuro', () => {
        expect(isDarkLogo(logoValue(px([0, 0, 0, 255], 10, 10)))).toBe(true);
    });
    it('rosso pieno (HOPE) NON e\' scuro anche se la luminanza e\' bassa', () => {
        expect(logoValue(px([220, 20, 20, 255], 10, 10))).toBeCloseTo(220 / 255);
        expect(isDarkLogo(logoValue(px([220, 20, 20, 255], 10, 10)))).toBe(false);
    });
    it('rosso scurissimo (VOLPE) = scuro', () => {
        expect(isDarkLogo(logoValue(px([70, 10, 10, 255], 10, 10)))).toBe(true);
    });
    it('i pixel trasparenti non contano', () => {
        expect(logoValue(px([255, 255, 255, 255], 2, 100))).toBe(1);
    });
    it('tutto trasparente o quasi tutto opaco = niente misura', () => {
        expect(logoValue(px([0, 0, 0, 0], 10))).toBe(null);
        expect(logoValue(px([0, 0, 0, 255], 100, 1))).toBe(null);
        expect(isDarkLogo(null)).toBe(false);
    });
});
