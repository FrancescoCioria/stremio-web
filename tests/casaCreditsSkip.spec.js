// Test del salto della sigla da Continue Watching (casaCreditsSkip.js).
//
// Ancorato a Silo S03E05 (13/09/2026): library ferma a 3110030 ms su 3153000,
// Continue Watching riapre la sigla. La soglia e' quella del core (0.9).

const { shouldSkipCredits, CREDITS_THRESHOLD_COEF } = require('../src/common/casaCreditsSkip');

const E05 = 'tt14688458:3:5';
const lib = (timeOffset, duration = 3153000, video_id = E05) => ({ state: { video_id, timeOffset, duration } });
const next = { id: 'tt14688458:3:6', deepLinks: { metaDetailsStreams: '#/detail/series/tt14688458/tt14688458%3A3%3A6', player: null } };

describe('shouldSkipCredits', () => {
    it('il caso Silo E05: da Continue Watching, fermo al 98%, E06 esiste -> salta', () => {
        const r = shouldSkipCredits({ fromContinueWatching: true, libraryItem: lib(3110030), selectedVideoId: E05, nextVideo: next });
        expect(r.skip).toBe(true);
    });

    it('stessa situazione ma aperto a mano dalla lista episodi -> NON salta', () => {
        const r = shouldSkipCredits({ fromContinueWatching: false, libraryItem: lib(3110030), selectedVideoId: E05, nextVideo: next });
        expect(r.skip).toBe(false);
        expect(r.reason).toBe('not-from-cw');
    });

    it('a meta\' episodio -> NON salta (la soglia e\' quella del core, 0.9)', () => {
        expect(CREDITS_THRESHOLD_COEF).toBe(0.9);
        expect(shouldSkipCredits({ fromContinueWatching: true, libraryItem: lib(1697000), selectedVideoId: E05, nextVideo: next }).skip).toBe(false);
        // esattamente sulla soglia: il core usa ">", quindi no
        expect(shouldSkipCredits({ fromContinueWatching: true, libraryItem: lib(3153000 * 0.9), selectedVideoId: E05, nextVideo: next }).skip).toBe(false);
        expect(shouldSkipCredits({ fromContinueWatching: true, libraryItem: lib(3153000 * 0.9 + 1), selectedVideoId: E05, nextVideo: next }).skip).toBe(true);
    });

    it('episodio successivo non ancora uscito -> NON salta, si riprende dalla sigla', () => {
        expect(shouldSkipCredits({ fromContinueWatching: true, libraryItem: lib(3110030), selectedVideoId: E05, nextVideo: null }).reason).toBe('no-next-video');
        expect(shouldSkipCredits({ fromContinueWatching: true, libraryItem: lib(3110030), selectedVideoId: E05, nextVideo: { deepLinks: {} } }).skip).toBe(false);
    });

    it('la library punta a un ALTRO episodio -> NON salta (non e\' una ripresa)', () => {
        const r = shouldSkipCredits({ fromContinueWatching: true, libraryItem: lib(3110030, 3153000, 'tt14688458:3:7'), selectedVideoId: E05, nextVideo: next });
        expect(r.skip).toBe(false);
        expect(r.reason).toBe('library-not-on-this-video');
    });

    it('durata sconosciuta o zero -> NON salta, nessuna eccezione', () => {
        expect(shouldSkipCredits({ fromContinueWatching: true, libraryItem: lib(3110030, 0), selectedVideoId: E05, nextVideo: next }).skip).toBe(false);
        expect(shouldSkipCredits({ fromContinueWatching: true, libraryItem: { state: { video_id: E05, timeOffset: 3110030 } }, selectedVideoId: E05, nextVideo: next }).skip).toBe(false);
        expect(shouldSkipCredits({ fromContinueWatching: true, libraryItem: null, selectedVideoId: E05, nextVideo: next }).skip).toBe(false);
        expect(shouldSkipCredits({ fromContinueWatching: true, libraryItem: lib(3110030), selectedVideoId: null, nextVideo: next }).skip).toBe(false);
    });

    it('il successivo con deep link player (stream gia\' noto) va bene come quello a streams', () => {
        const r = shouldSkipCredits({ fromContinueWatching: true, libraryItem: lib(3110030), selectedVideoId: E05, nextVideo: { deepLinks: { player: '#/player/x' } } });
        expect(r.skip).toBe(true);
    });
});
