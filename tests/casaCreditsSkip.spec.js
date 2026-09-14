// Test del salto della sigla da Continue Watching (casaCreditsSkip.js).
//
// Ancorato a Silo S3 (14/09/2026): card su E08 al 98,3% (3289845 / 3346389),
// E09 uscito il 28/08. La soglia e' quella del core (0.9), la scelta del
// successivo e' MetaItem::next_video del core.

const { decideCreditsSkip, nextVideoAfter, needsCreditsCheck, CREDITS_THRESHOLD_COEF } = require('../src/common/casaCreditsSkip');

const NOW = Date.parse('2026-09-14T19:30:00Z');
const ep = (s, e, released) => ({ id: `tt14688458:${s}:${e}`, season: s, episode: e, released });
// Forma di Cinemeta: speciali (stagione 0) in testa, poi le stagioni in ordine.
const SILO = [
    ep(0, 1, '2023-05-01T08:00:00.000Z'),
    ep(3, 7, '2026-08-14T08:00:00.000Z'),
    ep(3, 8, '2026-08-21T08:00:00.000Z'),
    ep(3, 9, '2026-08-28T08:00:00.000Z'),
    ep(3, 10, '2026-09-04T08:00:00.000Z'),
];
const E08 = 'tt14688458:3:8';
const E08_PCT = (3289845 / 3346389) * 100;

describe('decideCreditsSkip', () => {
    it('il caso Silo: card su E08 al 98% -> E09, direttamente', () => {
        const r = decideCreditsSkip({ progress: E08_PCT, videoId: E08, videos: SILO, now: NOW });
        expect(r.skip).toBe(true);
        expect(r.next.id).toBe('tt14688458:3:9');
    });

    it('a meta\' episodio -> NON salta (soglia del core, 0.9, ">")', () => {
        expect(CREDITS_THRESHOLD_COEF).toBe(0.9);
        expect(decideCreditsSkip({ progress: 50, videoId: E08, videos: SILO, now: NOW }).reason).toBe('not-in-credits');
        expect(decideCreditsSkip({ progress: 90, videoId: E08, videos: SILO, now: NOW }).skip).toBe(false);
        expect(decideCreditsSkip({ progress: 90.01, videoId: E08, videos: SILO, now: NOW }).skip).toBe(true);
    });

    it('lista episodi non arrivata (rete, timeout) -> NON salta, si riprende come prima', () => {
        expect(decideCreditsSkip({ progress: E08_PCT, videoId: E08, videos: null, now: NOW }).reason).toBe('no-meta');
    });

    it('episodio non riconoscibile dalla card -> NON salta', () => {
        expect(decideCreditsSkip({ progress: E08_PCT, videoId: null, videos: SILO, now: NOW }).reason).toBe('no-video-id');
    });

    it('ultimo episodio uscito -> NON salta, si riprende dalla sigla', () => {
        const r = decideCreditsSkip({ progress: E08_PCT, videoId: 'tt14688458:3:10', videos: SILO, now: NOW });
        expect(r.reason).toBe('no-next-video');
    });
});

describe('nextVideoAfter (= MetaItem::next_video del core)', () => {
    it('successivo non ancora uscito -> null', () => {
        const videos = [ep(3, 8, '2026-08-21T08:00:00.000Z'), ep(3, 9, '2026-09-20T08:00:00.000Z')];
        expect(nextVideoAfter(videos, E08, NOW)).toBeNull();
    });

    it('successivo senza data -> considerato uscito', () => {
        const videos = [ep(3, 8, '2026-08-21T08:00:00.000Z'), ep(3, 9, undefined)];
        expect(nextVideoAfter(videos, E08, NOW).id).toBe('tt14688458:3:9');
    });

    it('fine stagione -> la prima della stagione dopo', () => {
        const videos = [ep(3, 10, '2026-09-04T08:00:00.000Z'), ep(4, 1, '2026-09-10T08:00:00.000Z')];
        expect(nextVideoAfter(videos, 'tt14688458:3:10', NOW).id).toBe('tt14688458:4:1');
    });

    it('da una stagione normale NON si entra negli speciali (stagione 0)', () => {
        const videos = [ep(3, 10, '2026-09-04T08:00:00.000Z'), ep(0, 5, '2026-09-05T08:00:00.000Z')];
        expect(nextVideoAfter(videos, 'tt14688458:3:10', NOW)).toBeNull();
    });

    it('dentro gli speciali si resta negli speciali', () => {
        const videos = [ep(0, 1, '2023-05-01T08:00:00.000Z'), ep(0, 2, '2023-05-02T08:00:00.000Z')];
        expect(nextVideoAfter(videos, 'tt14688458:0:1', NOW).id).toBe('tt14688458:0:2');
    });

    it('episodio non nella lista o lista rotta -> null, nessuna eccezione', () => {
        expect(nextVideoAfter(SILO, 'tt0000000:1:1', NOW)).toBeNull();
        expect(nextVideoAfter(null, E08, NOW)).toBeNull();
        expect(nextVideoAfter([null, { id: E08 }], E08, NOW)).toBeNull();
    });
});

describe('needsCreditsCheck', () => {
    it('solo serie oltre il 90%: tutte le altre card si aprono senza aspettare la rete', () => {
        expect(needsCreditsCheck(E08_PCT, 'series')).toBe(true);
        expect(needsCreditsCheck(E08_PCT, 'movie')).toBe(false);
        expect(needsCreditsCheck(40, 'series')).toBe(false);
        expect(needsCreditsCheck(undefined, 'series')).toBe(false);
    });
});
