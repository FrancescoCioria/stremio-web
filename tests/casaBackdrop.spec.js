// Lo sfondo della pagina serie (casaBackdrop.js).
const { backdropFor, stillUrl } = require('../src/common/casaBackdrop');

const BG = 'https://images.metahub.space/background/medium/tt5875444/img';
const THUMB = 'https://episodes.metahub.space/tt5875444/1/1/w780.jpg';

describe('stillUrl', () => {
    it('metahub w780 -> w1280 (non 780x439, non original da 1,9 MB)', () => {
        expect(stillUrl(THUMB)).toBe('https://episodes.metahub.space/tt5875444/1/1/w1280.jpg');
    });
    it('un indirizzo qualsiasi resta com\'e\'', () => {
        expect(stillUrl('https://example.com/x.jpg')).toBe('https://example.com/x.jpg');
    });
    it('niente miniatura -> null', () => {
        expect(stillUrl(null)).toBe(null);
        expect(stillUrl('')).toBe(null);
    });
});

describe('backdropFor', () => {
    it('episodio -> la sua foto in alta risoluzione', () => {
        expect(backdropFor({ video: { thumbnail: THUMB, watched: false }, background: BG, hideSpoilers: false })).toMatch(/w1280\.jpg$/);
    });
    it('SPOILER: nascondi-spoiler attivo e episodio NON visto -> sfondo della serie', () => {
        expect(backdropFor({ video: { thumbnail: THUMB, watched: false }, background: BG, hideSpoilers: true })).toBe(BG);
    });
    it('nascondi-spoiler attivo ma episodio visto -> la sua foto', () => {
        expect(backdropFor({ video: { thumbnail: THUMB, watched: true }, background: BG, hideSpoilers: true })).toMatch(/w1280\.jpg$/);
    });
    it('nessun episodio -> sfondo della serie', () => {
        expect(backdropFor({ video: null, background: BG, hideSpoilers: false })).toBe(BG);
    });
    it('episodio senza miniatura -> sfondo della serie', () => {
        expect(backdropFor({ video: { thumbnail: null }, background: BG, hideSpoilers: false })).toBe(BG);
    });
});
