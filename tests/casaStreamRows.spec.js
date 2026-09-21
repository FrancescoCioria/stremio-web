// Le righe della pagina torrent (qualityBuckets.displayRows).
const { displayRows } = require('../src/common/qualityBuckets');

const s = (name, height) => ({ name, height });

describe('displayRows', () => {
    it('"Tutti" per prima, poi 4K / 1080p / 720p nell\'ordine', () => {
        const rows = displayRows([s('a', 1080), s('b', 2160), s('c', 720), s('d', 1080)]);
        expect(rows.map((r) => r.label)).toEqual(['Tutti', '4K', '1080p', '720p']);
        expect(rows[0].streams.map((x) => x.name)).toEqual(['a', 'b', 'c', 'd']);
        expect(rows[2].streams.map((x) => x.name)).toEqual(['a', 'd']);
    });
    it('solo le qualita\' che hanno torrent', () => {
        expect(displayRows([s('a', 1080)]).map((r) => r.label)).toEqual(['Tutti', '1080p']);
    });
    it('qualita\' sconosciuta: solo in "Tutti", non si indovina', () => {
        const rows = displayRows([s('x', 0), s('y', undefined)]);
        expect(rows.map((r) => r.label)).toEqual(['Tutti']);
        expect(rows[0].streams).toHaveLength(2);
    });
    it('REGRESSIONE: un "1078p" e\' un 1080p, non va nella riga delle basse (Silo, visto sulla TV)', () => {
        expect(displayRows([s('silo', 1078)])[1]).toMatchObject({ label: '1080p' });
    });
    it('e un "2076p" e\' un 4K', () => {
        expect(displayRows([s('x', 2076)])[1]).toMatchObject({ label: '4K' });
    });
    it('480p va nella riga delle basse (720p)', () => {
        expect(displayRows([s('z', 480)])[1]).toMatchObject({ label: '720p' });
    });
    it('l\'ordine dentro la riga e\' quello della lista (non si riordina)', () => {
        const rows = displayRows([s('b', 2160), s('a', 2160)]);
        expect(rows[1].streams.map((x) => x.name)).toEqual(['b', 'a']);
    });
    it('lista vuota -> solo "Tutti", vuota', () => {
        expect(displayRows([])).toEqual([{ key: 'all', label: 'Tutti', streams: [] }]);
    });
});
