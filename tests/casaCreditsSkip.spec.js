// Test del salto della sigla da Continue Watching (casaCreditsSkip.js).
//
// Ancorato a Silo S03E05 (13/09/2026, library ferma a 3110030 ms su 3153000) e
// S03E07 (14/09/2026, 3239193 su 3341170). La soglia e' quella del core (0.9).
//
// ⚠️ `lib()` ha la forma VERA del libraryItem serializzato nel player: solo
// `timeOffset` e `video_id`, NESSUNA `duration`. La v4.104 aveva una fixture con
// `duration` e passava i test mentre in casa non saltava mai.

const { shouldSkipCredits, CREDITS_THRESHOLD_COEF } = require('../src/common/casaCreditsSkip');

const E05 = 'tt14688458:3:5';
const lib = (timeOffset, video_id = E05) => ({ id: 'tt14688458', state: { timeOffset, video_id } });
const next = { id: 'tt14688458:3:6', deepLinks: { metaDetailsStreams: '#/detail/series/tt14688458/tt14688458%3A3%3A6', player: null } };
// percentuale della card, come il core: time_offset / duration * 100
const pct = (timeOffset, duration) => (timeOffset / duration) * 100;
const E05_PCT = pct(3110030, 3153000);

describe('shouldSkipCredits', () => {
    it('il caso Silo E05: da Continue Watching, fermo al 98%, E06 esiste -> salta', () => {
        const r = shouldSkipCredits({ fromContinueWatching: true, progress: E05_PCT, libraryItem: lib(3110030), selectedVideoId: E05, nextVideo: next });
        expect(r.skip).toBe(true);
    });

    it('il caso Silo E07: libraryItem senza duration (forma reale), card al 97% -> salta', () => {
        const E07 = 'tt14688458:3:7';
        const r = shouldSkipCredits({
            fromContinueWatching: true,
            progress: pct(3239193, 3341170),
            libraryItem: lib(3239193, E07),
            selectedVideoId: E07,
            nextVideo: { id: 'tt14688458:3:8', deepLinks: { player: '#/player/e08' } },
        });
        expect(r).toEqual({ skip: true, reason: 'credits' });
    });

    it('stessa situazione ma aperto a mano dalla lista episodi -> NON salta', () => {
        const r = shouldSkipCredits({ fromContinueWatching: false, progress: E05_PCT, libraryItem: lib(3110030), selectedVideoId: E05, nextVideo: next });
        expect(r.skip).toBe(false);
        expect(r.reason).toBe('not-from-cw');
    });

    it('a meta\' episodio -> NON salta (la soglia e\' quella del core, 0.9)', () => {
        expect(CREDITS_THRESHOLD_COEF).toBe(0.9);
        const at = (progress) => shouldSkipCredits({ fromContinueWatching: true, progress, libraryItem: lib(3110030), selectedVideoId: E05, nextVideo: next }).skip;
        expect(at(pct(1697000, 3153000))).toBe(false);
        // esattamente sulla soglia: il core usa ">", quindi no
        expect(at(90)).toBe(false);
        expect(at(90.01)).toBe(true);
    });

    it('percentuale assente o illeggibile (link vecchio senza casaProgress) -> NON salta, nessuna eccezione', () => {
        for (const progress of [undefined, null, NaN, 0, 'abc']) {
            const r = shouldSkipCredits({ fromContinueWatching: true, progress, libraryItem: lib(3110030), selectedVideoId: E05, nextVideo: next });
            expect(r.reason).toBe('not-in-credits');
        }
    });

    it('episodio successivo non ancora uscito -> NON salta, si riprende dalla sigla', () => {
        expect(shouldSkipCredits({ fromContinueWatching: true, progress: E05_PCT, libraryItem: lib(3110030), selectedVideoId: E05, nextVideo: null }).reason).toBe('no-next-video');
        expect(shouldSkipCredits({ fromContinueWatching: true, progress: E05_PCT, libraryItem: lib(3110030), selectedVideoId: E05, nextVideo: { deepLinks: {} } }).skip).toBe(false);
    });

    it('la library punta a un ALTRO episodio -> NON salta (non e\' una ripresa)', () => {
        const r = shouldSkipCredits({ fromContinueWatching: true, progress: E05_PCT, libraryItem: lib(3110030, 'tt14688458:3:7'), selectedVideoId: E05, nextVideo: next });
        expect(r.skip).toBe(false);
        expect(r.reason).toBe('library-not-on-this-video');
    });

    it('library o video selezionato mancanti -> NON salta, nessuna eccezione', () => {
        expect(shouldSkipCredits({ fromContinueWatching: true, progress: E05_PCT, libraryItem: null, selectedVideoId: E05, nextVideo: next }).skip).toBe(false);
        expect(shouldSkipCredits({ fromContinueWatching: true, progress: E05_PCT, libraryItem: lib(3110030), selectedVideoId: null, nextVideo: next }).skip).toBe(false);
    });

    it('il successivo con deep link player (stream gia\' noto) va bene come quello a streams', () => {
        const r = shouldSkipCredits({ fromContinueWatching: true, progress: E05_PCT, libraryItem: lib(3110030), selectedVideoId: E05, nextVideo: { deepLinks: { player: '#/player/x' } } });
        expect(r.skip).toBe(true);
    });
});
