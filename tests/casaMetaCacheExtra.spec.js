// Lista episodi per il salto dei titoli di coda: Cinemeta + extra del backend.
// Caso: X Factor 03/10/2026, card su E03 al 96,6%, Cinemeta elencava solo E01.

const { withExtraVideos } = require('../src/common/casaMetaCache');
const { decideCreditsSkip } = require('../src/common/casaCreditsSkip');

const ep = (s, e, released) => ({ id: `tt1194223:${s}:${e}`, season: s, episode: e, released });
const CINEMETA = [ep(0, 1, '2010-01-01T00:00:00.000Z'), ep(19, 12, '2025-12-11T21:15:00.000Z'), ep(20, 1, '2026-09-10T21:15:00.000Z')];
const EXTRA = [ep(20, 2, '2026-09-17'), ep(20, 3, '2026-09-24'), ep(20, 4, '2026-10-01')];
const NOW = Date.parse('2026-10-03T13:11:07Z');

describe('withExtraVideos', () => {
    it('X Factor: le extra entrano dopo E01, in ordine', () => {
        const v = withExtraVideos(CINEMETA, EXTRA);
        expect(v.map((x) => x.id)).toEqual(['tt1194223:0:1', 'tt1194223:19:12', 'tt1194223:20:1', 'tt1194223:20:2', 'tt1194223:20:3', 'tt1194223:20:4']);
    });

    it('con le extra la card su E03 nei titoli di coda trova E04', () => {
        const videos = withExtraVideos(CINEMETA, EXTRA);
        const d = decideCreditsSkip({ progress: 96.6, videoId: 'tt1194223:20:3', videos, now: NOW });
        expect(d.skip).toBe(true);
        expect(d.next.id).toBe('tt1194223:20:4');
        // senza: il bug di oggi
        expect(decideCreditsSkip({ progress: 96.6, videoId: 'tt1194223:20:3', videos: CINEMETA, now: NOW }).reason).toBe('no-next-video');
    });

    it('extra gia\' in Cinemeta (il giorno in cui si aggiorna) -> nessun doppione', () => {
        const v = withExtraVideos(CINEMETA.concat([ep(20, 2, '2026-09-17T21:15:00.000Z')]), EXTRA);
        expect(v.filter((x) => x.id === 'tt1194223:20:2')).toHaveLength(1);
        expect(v).toHaveLength(6);
    });

    it('l\'ordine di Cinemeta non si tocca (speciali in mezzo, episodi invertiti)', () => {
        const messy = [ep(1, 7, '2008-03-02'), ep(1, 6, '2008-02-24'), ep(0, 1, '2009-01-01'), ep(2, 1, '2009-03-08')];
        const v = withExtraVideos(messy, [ep(2, 2, '2009-03-15')]);
        expect(v.map((x) => x.id)).toEqual(['tt1194223:1:7', 'tt1194223:1:6', 'tt1194223:0:1', 'tt1194223:2:1', 'tt1194223:2:2']);
    });

    it('extra di una stagione in mezzo: dopo il suo predecessore, non in coda', () => {
        const v = withExtraVideos([ep(1, 1, 'a'), ep(1, 3, 'c'), ep(2, 1, 'd')], [ep(1, 2, 'b')]);
        expect(v.map((x) => x.id)).toEqual(['tt1194223:1:1', 'tt1194223:1:2', 'tt1194223:1:3', 'tt1194223:2:1']);
    });

    it('nessuna extra o Cinemeta assente -> lista invariata (stesso oggetto) / null', () => {
        expect(withExtraVideos(CINEMETA, [])).toBe(CINEMETA);
        expect(withExtraVideos(CINEMETA, null)).toBe(CINEMETA);
        expect(withExtraVideos(null, EXTRA)).toBe(null);
    });
});
