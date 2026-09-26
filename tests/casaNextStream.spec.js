// Test di "episodio successivo" su binge debole (casaNextStream.js).
//
// Ancorato a President Curtis S1E6 (26/09/2026): il binge del core (5 seeder)
// non partiva; il backend indica il migliore 1080p e qui si riscrive il deep
// link del player, mai la pagina torrent.

const { withPlayerStream } = require('../src/common/casaNextStream');

const PLAYER = '#/player/eJxOLD/http%3A%2F%2F100.114.200.47%3A8765%2Fstremio-addon%2Fmanifest.json/https%3A%2F%2Fv3-cinemeta.strem.io%2Fmanifest.json/series/tt37692332/tt37692332%3A1%3A6';

describe('withPlayerStream', () => {
    it('sostituisce solo lo stream codificato, il resto del link resta uguale', () => {
        const out = withPlayerStream(PLAYER, 'NUOVO/+=');
        const [, , enc, ...rest] = out.split('/');
        expect(enc).toBe(encodeURIComponent('NUOVO/+='));
        expect(rest.join('/')).toBe(PLAYER.split('/').slice(3).join('/'));
    });

    it('link che non e\' del player: null (si resta al deep link del core)', () => {
        expect(withPlayerStream('#/detail/series/tt1/tt1%3A1%3A2', 'x')).toBeNull();
        expect(withPlayerStream(null, 'x')).toBeNull();
        expect(withPlayerStream(PLAYER, null)).toBeNull();
    });
});
