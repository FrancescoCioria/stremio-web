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

describe('supersededTorrentPagesBelow', () => {
    const { supersededTorrentPagesBelow } = require('../src/common/casaNextVideoHistory');
    const B = 'http://localhost:8080/';
    const EP = B + '#/detail/series/tt14452776?season=5';
    const tor = (e) => B + '#/detail/series/tt14452776/tt14452776%3A5%3A' + e;
    const PLAYER = B + '#/player/eAEBiwF0abc';

    test('The Bear 28/09: da torrent E02 si salta torrent E01 e si torna agli episodi', () => {
        // session history reale: home, episodi, torrent E01 (?season=5), torrent E02, player E02
        const urls = [B, EP, tor(1) + '?season=5', tor(2), PLAYER];
        expect(supersededTorrentPagesBelow(urls, 3)).toBe(1);
    });
    test('catena di "prossimo episodio": salta tutti i torrent della serie sotto', () => {
        expect(supersededTorrentPagesBelow([B, EP, tor(1), tor(2), tor(3), PLAYER], 4)).toBe(2);
    });
    test('torrent sopra gli episodi (caso normale): back normale', () => {
        expect(supersededTorrentPagesBelow([B, EP, tor(1), PLAYER], 2)).toBe(0);
    });
    test('torrent di UN\'ALTRA serie sotto: non si salta', () => {
        expect(supersededTorrentPagesBelow([B, B + '#/detail/series/tt0000001/tt0000001%3A1%3A1', tor(2)], 2)).toBe(0);
    });
    test('pagina corrente non torrent (episodi, player): 0', () => {
        expect(supersededTorrentPagesBelow([B, tor(1), EP], 2)).toBe(0);
        expect(supersededTorrentPagesBelow([B, tor(1), tor(2), PLAYER], 3)).toBe(0);
    });
    test('la voce piu\' in basso non si salta mai', () => {
        expect(supersededTorrentPagesBelow([tor(1), tor(2)], 1)).toBe(0);
        expect(supersededTorrentPagesBelow([tor(1), tor(2), tor(3)], 2)).toBe(1);
    });
    test('forma /metadetails: stesso salto', () => {
        const md = (e) => B + '#/metadetails/series/tt14452776/tt14452776%3A5%3A' + e;
        expect(supersededTorrentPagesBelow([B, EP, md(1), md(2)], 3)).toBe(1);
    });
    test('input assurdi: 0', () => {
        expect(supersededTorrentPagesBelow(null, 1)).toBe(0);
        expect(supersededTorrentPagesBelow([B, tor(1)], 0)).toBe(0);
        expect(supersededTorrentPagesBelow([B, tor(1)], 5)).toBe(0);
    });
});
