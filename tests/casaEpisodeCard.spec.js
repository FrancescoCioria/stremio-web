// Stato e testi della card episodio (casaEpisodeCard.js), sui casi del
// prototipo dell'handoff: Slow Horses S6, al 21/09/2026.

const { episodeState, episodeMeta, upcomingAirLabel, paddedEpisode } = require('../src/common/casaEpisodeCard');

const NOW = Date.parse('2026-09-21T20:00:00Z');
const at = (iso) => new Date(`${iso}T08:00:00Z`);
const ep = (o) => ({ id: 'tt5875444:6:1', season: 6, episode: 1, released: at('2026-09-16'), upcoming: false, watched: false, progress: 0, ...o });

describe('episodeState', () => {
    it('visto', () => expect(episodeState(ep({ watched: true }), NOW)).toBe('watched'));
    it('a meta\'', () => expect(episodeState(ep({ progress: 74 }), NOW)).toBe('inProgress'));
    it('uscito e non visto', () => expect(episodeState(ep({}), NOW)).toBe('available'));
    it('futuro (data)', () => expect(episodeState(ep({ released: at('2026-09-30') }), NOW)).toBe('upcoming'));
    it('futuro (flag del core)', () => expect(episodeState(ep({ upcoming: true }), NOW)).toBe('upcoming'));
    it('visto vince su tutto, anche su una data sbagliata nel futuro', () => {
        expect(episodeState(ep({ watched: true, released: at('2026-12-01') }), NOW)).toBe('watched');
    });
    it('senza data non e\' futuro: resta riproducibile', () => {
        expect(episodeState(ep({ released: null }), NOW)).toBe('available');
    });
});

describe('episodeMeta', () => {
    it('visto: "16 set 2026 · 49 min"', () => {
        expect(episodeMeta(ep({ watched: true }), 49, NOW)).toBe('16 set 2026 · 49 min');
    });
    it('a meta\': i minuti che MANCANO, non la durata', () => {
        expect(episodeMeta(ep({ released: at('2026-09-23'), progress: 74 }), 47, NOW - 0)).toBe('23 set 2026 · 12 min rimanenti');
    });
    it('quasi finito: almeno "1 min", mai "0 min rimanenti"', () => {
        expect(episodeMeta(ep({ progress: 99.9 }), 47, NOW)).toMatch(/1 min rimanenti$/);
    });
    it('durata sconosciuta: si OMETTE, non si inventa', () => {
        expect(episodeMeta(ep({}), null, NOW)).toBe('16 set 2026');
    });
    it('futuro: "In arrivo"', () => {
        expect(episodeMeta(ep({ released: at('2026-09-30') }), 50, NOW)).toBe('In arrivo');
    });
});

describe('upcomingAirLabel / paddedEpisode', () => {
    it('"30 SET"', () => expect(upcomingAirLabel(at('2026-09-30'))).toBe('30 SET'));
    it('"7 OTT"', () => expect(upcomingAirLabel(at('2026-10-07'))).toBe('7 OTT'));
    it('senza data: niente riga', () => expect(upcomingAirLabel(null)).toBe(null));
    it('"03"', () => expect(paddedEpisode(3)).toBe('03'));
    it('"12"', () => expect(paddedEpisode(12)).toBe('12'));
});
