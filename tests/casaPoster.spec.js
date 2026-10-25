const { posterFallback } = require('../src/common/casaPoster');

describe('posterFallback', () => {
    test('poster presente: resta quello', () => {
        expect(posterFallback('https://x/p.jpg', 'tt1')).toBe('https://x/p.jpg');
    });
    test('senza poster, id IMDb (anche di episodio): metahub', () => {
        expect(posterFallback(null, 'tt42026819')).toBe('https://images.metahub.space/poster/small/tt42026819/img');
        expect(posterFallback('', 'tt42026819:1:4')).toBe('https://images.metahub.space/poster/small/tt42026819/img');
    });
    test('id non IMDb: niente da inventare', () => {
        expect(posterFallback(null, 'kitsu:1')).toBe(null);
    });
});
