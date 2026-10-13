// Test del premio freshness della ricerca (casaSearchOrder.js), su righe VERE
// di Cinemeta + voti IMDb del 14/10/2026 (taratura nel commento del modulo).

const { freshnessOrder } = require('../src/common/casaSearchOrder');

const row = (list) => {
    const items = list.map(([name, year, votes], i) => ({ id: 'tt' + i, name, releaseInfo: String(year), _v: votes }));
    const votes = Object.fromEntries(items.filter((x) => x._v > 0).map((x) => [x.id, x._v]));
    return { items, votes };
};
const names = (items) => items.map((x) => x.name + ' ' + x.releaseInfo);

describe('freshnessOrder', () => {
    test('Spider-Man: franchise dal piu\' recente, titolo esatto fermo, spazzatura in coda', () => {
        const { items, votes } = row([
            ['Spider-Man: Brand New Day', 2026, 344361],
            ['Spider-Man', 2002, 1000733],
            ['Spider-Man: No Way Home', 2021, 1081111],
            ['Spider-Man: Homecoming', 2017, 842372],
            ['Spider-Man: Into the Spider-Verse', 2018, 820471],
            ['Spider-Man: Across the Spider-Verse', 2023, 557872],
            ['Spider-Man: Far from Home', 2019, 679969],
            ['Spider-Man 2', 2004, 811419],
            ['Spider-Man: Beyond the Spider-Verse', 2027, 0],
            ['The Amazing Spider-Man', 2012, 790730],
            ['Spider-Man 3', 2007, 722265],
            ['The Amazing Spider-Man 2', 2014, 610887],
            ['Spider-Man: Lotus', 2023, 3292],
            ['Spider Man: Lost Cause', 2014, 490],
        ]);
        expect(names(freshnessOrder(items, 'Spider-Man', votes))).toEqual([
            'Spider-Man: Brand New Day 2026',
            'Spider-Man 2002',
            'Spider-Man: Across the Spider-Verse 2023',
            'Spider-Man: No Way Home 2021',
            'Spider-Man: Far from Home 2019',
            'Spider-Man: Into the Spider-Verse 2018',
            'Spider-Man: Homecoming 2017',
            'The Amazing Spider-Man 2 2014',
            'The Amazing Spider-Man 2012',
            'Spider-Man 3 2007',
            'Spider-Man 2 2004',
            'Spider-Man: Beyond the Spider-Verse 2027',
            'Spider-Man: Lotus 2023',
            'Spider Man: Lost Cause 2014',
        ]);
    });

    test('Psycho: il titolo esatto non viene scavalcato da American Psycho', () => {
        const { items, votes } = row([['Psycho', 1960, 796799], ['American Psycho', 2000, 860242]]);
        expect(names(freshnessOrder(items, 'psycho', votes))[0]).toBe('Psycho 1960');
    });

    test('voti lontani (> doppio): resta l\'ordine di Cinemeta', () => {
        const { items, votes } = row([['Dune', 1984, 194500], ['Planet Dune', 2021, 1355]]);
        expect(names(freshnessOrder(items, 'x', votes))).toEqual(['Dune 1984', 'Planet Dune 2021']);
    });

    test('stesso titolo esatto e voti simili: vince il piu\' recente (Halloween)', () => {
        const { items, votes } = row([['Halloween', 1978, 344996], ['Halloween', 2007, 140626], ['Halloween', 2018, 189494]]);
        expect(names(freshnessOrder(items, 'Halloween', votes))).toEqual(['Halloween 2018', 'Halloween 1978', 'Halloween 2007']);
    });

    test('senza voti: ordine invariato', () => {
        const { items } = row([['A', 2000, 0], ['B', 2020, 0]]);
        expect(names(freshnessOrder(items, 'a', {}))).toEqual(['A 2000', 'B 2020']);
    });
});
