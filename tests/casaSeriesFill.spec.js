// Campi della scheda serie da TMDB dove Cinemeta e' vuota (casaSeriesFill.js).

const { fillSeriesMeta } = require('../src/common/casaSeriesFill');

const FILL = { name: 'Nord Sud Ovest Est', description: 'Trama TMDB', logo: 'https://tmdb/logo.png', background: 'https://tmdb/bg.jpg' };

describe('fillSeriesMeta', () => {
    test('scheda grezza: si riempiono nome, trama, sfondo, logo', () => {
        const raw = { id: 'tt42026819', type: 'series', name: '', description: null, background: null, logo: null, inLibrary: true };
        const out = fillSeriesMeta(raw, FILL);
        expect(out).toMatchObject({ name: 'Nord Sud Ovest Est', description: 'Trama TMDB', background: 'https://tmdb/bg.jpg', logo: 'https://tmdb/logo.png', casaFallbackLogo: null, inLibrary: true });
    });

    test('scheda completa: STESSO oggetto se TMDB non ha un logo diverso', () => {
        const full = { name: 'Slow Horses', description: 'EN', background: 'https://metahub/bg', logo: 'https://metahub/logo' };
        expect(fillSeriesMeta(full, { ...FILL, logo: null })).toBe(full);
        expect(fillSeriesMeta(full, null)).toBe(full);
    });

    test('logo di Cinemeta presente: resta suo, TMDB e\' solo il ripiego', () => {
        const full = { name: 'X', description: 'd', background: 'b', logo: 'https://metahub/logo' };
        const out = fillSeriesMeta(full, FILL);
        expect(out.logo).toBe('https://metahub/logo');
        expect(out.casaFallbackLogo).toBe('https://tmdb/logo.png');
        expect(out.description).toBe('d');
    });

    test('TMDB vuoto dove Cinemeta e\' vuota: resta vuoto', () => {
        const raw = { name: '', description: null, background: null, logo: null };
        expect(fillSeriesMeta(raw, { name: null, description: null, logo: null, background: null })).toBe(raw);
    });
});
