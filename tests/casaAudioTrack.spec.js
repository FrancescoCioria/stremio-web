// Test della scelta della traccia audio per lingua (casaAudioTrack.js).
//
// Ancorato a President Curtis S1E6 (26/09/2026): tracce "fre" + "eng", lingua
// voluta "en" dal backend Casa -> partiva la prima (francese).

const { findTrackByLang } = require('../src/common/casaAudioTrack');

const FR_EN = [{ id: 'a0', lang: 'fre' }, { id: 'a1', lang: 'eng' }];

describe('findTrackByLang', () => {
    it('il caso President Curtis: "en" dal backend trova la traccia "eng"', () => {
        expect(findTrackByLang(FR_EN, 'en')).toEqual({ id: 'a1', lang: 'eng' });
    });

    it('impostazioni Stremio a 3 lettere ("eng") continuano a funzionare', () => {
        expect(findTrackByLang(FR_EN, 'eng')).toEqual({ id: 'a1', lang: 'eng' });
    });

    it('tracce a 2 lettere', () => {
        expect(findTrackByLang([{ id: 'x', lang: 'fr' }, { id: 'y', lang: 'en' }], 'eng').id).toBe('y');
    });

    it('639-2/T contro 639-2/B ("fra" vs "fre")', () => {
        expect(findTrackByLang(FR_EN, 'fra').id).toBe('a0');
        expect(findTrackByLang([{ id: 'd', lang: 'deu' }], 'ger').id).toBe('d');
    });

    it('lingua assente nel file: niente (decide il player, come prima)', () => {
        expect(findTrackByLang(FR_EN, 'it')).toBeUndefined();
    });

    it('traccia senza lingua non combacia con niente', () => {
        expect(findTrackByLang([{ id: 'u' }, { id: 'n', lang: null }], 'en')).toBeUndefined();
    });

    it('lingua voluta assente: niente', () => {
        expect(findTrackByLang(FR_EN, null)).toBeUndefined();
        expect(findTrackByLang(FR_EN, '')).toBeUndefined();
    });
});
