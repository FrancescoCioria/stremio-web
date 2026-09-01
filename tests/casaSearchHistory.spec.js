// La cronologia in cima al menu di ricerca deve parlare della ricerca in
// corso. Il caso che ha prodotto questo file: scrivendo "ghost in the" le
// prime sei righe erano Toy Story / the witness / avatar aang.

const { filterSearchHistory, matchesQuery } = require('../src/common/casaSearchHistory');

const history = [
    { query: 'Toy Story' },
    { query: 'Toy Story 5' },
    { query: 'The Sheep Detectives' },
    { query: 'the witness' },
    { query: 'avatar aang' },
    { query: 'Scavengers Reign' },
    { query: 'Ghost in the Shell' },
];

describe('filterSearchHistory', () => {
    test('campo vuoto -> cronologia intera (fino al limite)', () => {
        expect(filterSearchHistory(history, '').map((i) => i.query)).toEqual(history.map((i) => i.query));
        expect(filterSearchHistory(history, null, 3)).toHaveLength(3);
    });

    test('il caso del difetto: "ghost in the" non tira dentro Toy Story', () => {
        expect(filterSearchHistory(history, 'ghost in the').map((i) => i.query)).toEqual(['Ghost in the Shell']);
    });

    test('nessuna voce compatibile -> lista vuota (la sezione sparisce)', () => {
        expect(filterSearchHistory(history, 'dune')).toEqual([]);
    });

    test('ordine cronologico preservato', () => {
        expect(filterSearchHistory(history, 'toy').map((i) => i.query)).toEqual(['Toy Story', 'Toy Story 5']);
    });

    test('input non valido non esplode', () => {
        expect(filterSearchHistory(null, 'x')).toEqual([]);
        expect(filterSearchHistory([{ query: null }], 'x')).toEqual([]);
    });
});

describe('matchesQuery', () => {
    test('sottostringa parziale', () => {
        expect(matchesQuery('Ghost in the Shell: Stand Alone Complex', 'ghost in the')).toBe(true);
    });

    test('parole in ordine libero', () => {
        expect(matchesQuery('Ghost in the Shell', 'shell ghost')).toBe(true);
    });

    test('accenti e punteggiatura non contano', () => {
        expect(matchesQuery('Pokémon', 'pokemon')).toBe(true);
        expect(matchesQuery('Spider-Man', 'spider man')).toBe(true);
    });

    test('parola che non c\'e\' -> niente match', () => {
        expect(matchesQuery('Ghost in the Shell', 'ghost dune')).toBe(false);
    });
});
