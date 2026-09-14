// Test della navigazione "episodio successivo" (casaNextVideoHistory.js).
//
// Ancorato a Silo 14/09/2026: indietro dal player di E08 portava ai torrent di E07.

const { nextVideoNavigation } = require('../src/common/casaNextVideoHistory');

const E08 = {
    metaDetailsVideos: '#/detail/series/tt14688458',
    metaDetailsStreams: '#/detail/series/tt14688458/tt14688458%3A3%3A8',
    player: '#/player/abc/x/y/series/tt14688458/tt14688458%3A3%3A8',
};

describe('nextVideoNavigation', () => {
    it('il caso Silo: player del successivo noto -> prima i SUOI torrent, poi il player sopra', () => {
        expect(nextVideoNavigation(E08, false, false)).toEqual({
            kind: 'streams-then-player',
            streams: E08.metaDetailsStreams,
            player: E08.player,
        });
    });

    it('stessa cosa a fine episodio con binge-watching', () => {
        expect(nextVideoNavigation(E08, true, true).kind).toBe('streams-then-player');
    });

    it('fine episodio SENZA binge-watching -> indietro, come prima', () => {
        expect(nextVideoNavigation(E08, false, true)).toEqual({ kind: 'back' });
    });

    it('successivo senza stream noto -> sostituisce il player con i suoi torrent, come prima', () => {
        expect(nextVideoNavigation({ metaDetailsStreams: E08.metaDetailsStreams, player: null }, false, false))
            .toEqual({ kind: 'replace', url: E08.metaDetailsStreams });
    });

    it('solo il player, senza pagina torrent -> replace del player, come prima', () => {
        expect(nextVideoNavigation({ player: E08.player }, true, true)).toEqual({ kind: 'replace', url: E08.player });
    });

    it('deep link assenti o rotti -> nessuna navigazione, nessuna eccezione', () => {
        expect(nextVideoNavigation(null, false, false)).toEqual({ kind: 'none' });
        expect(nextVideoNavigation({}, true, true)).toEqual({ kind: 'none' });
    });
});
