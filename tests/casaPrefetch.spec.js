// Copyright (C) 2017-2026 Smart code 203358507

const { prefetchTargets } = require('../src/routes/Board/casaPrefetchTargets');
const { pruneEntries } = require('../src/common/casaPersistentCache');

const ready = (items) => ({ content: { type: 'Ready', content: items } });

describe('prefetchTargets', () => {
    it('prende solo la TESTA di ogni riga', () => {
        const items = Array.from({ length: 20 }, (_, i) => ({ id: `tt${1000 + i}`, type: 'movie' }));
        expect(prefetchTargets([ready(items)], 8)).toHaveLength(8);
    });

    // ⚠️ Lo stesso titolo sta spesso in piu' righe (Continue Watching + Ultime
    // uscite): scaldarlo due volte sarebbe traffico buttato.
    it('deduplica fra righe diverse', () => {
        const out = prefetchTargets([
            ready([{ id: 'tt1', type: 'movie' }]),
            ready([{ id: 'tt1', type: 'movie' }, { id: 'tt2', type: 'series' }]),
        ], 8);
        expect(out.map((t) => t.imdb)).toEqual(['tt1', 'tt2']);
    });

    // Gli item di Continue Watching sono episodi: `tt123:1:4`. Cinemeta e il
    // backend vogliono il titolo padre.
    it('riduce un id di episodio al suo titolo', () => {
        expect(prefetchTargets([ready([{ id: 'tt123:1:4', type: 'series' }])], 8)[0].imdb).toBe('tt123');
    });

    it('salta gli id non IMDb e gli item senza type', () => {
        const out = prefetchTargets([ready([
            { id: 'kitsu:42', type: 'series' },
            { id: 'tt9', type: null },
            { id: 'tt7', type: 'movie' },
        ])], 8);
        expect(out.map((t) => t.imdb)).toEqual(['tt7']);
    });

    it('ignora le righe non ancora caricate', () => {
        expect(prefetchTargets([{ content: { type: 'Loading' } }, null], 8)).toEqual([]);
        expect(prefetchTargets(undefined, 8)).toEqual([]);
    });

    it('usa `_id` quando manca `id` (item di library)', () => {
        expect(prefetchTargets([ready([{ _id: 'tt55', type: 'movie' }])], 8)[0].imdb).toBe('tt55');
    });
});

describe('pruneEntries', () => {
    const at = 1_000_000_000;
    const TTL = 86_400_000;

    it('butta le voci scadute', () => {
        const kept = pruneEntries([['vecchia', { t: at - TTL - 1 }], ['fresca', { t: at - 10 }]], 10, TTL, at);
        expect(kept.map(([k]) => k)).toEqual(['fresca']);
    });

    // ⚠️ Il tetto tiene le PIU' RECENTI: una cache piena di roba vecchia occupa
    // la quota di localStorage senza mai essere letta — e in quella quota ci
    // vive anche il bucket `streams` del core.
    it('col tetto pieno tiene le piu\' recenti', () => {
        const kept = pruneEntries([['a', { t: at - 300 }], ['b', { t: at - 100 }], ['c', { t: at - 200 }]], 2, TTL, at);
        expect(kept.map(([k]) => k)).toEqual(['b', 'c']);
    });

    it('non esplode su voci malformate', () => {
        expect(pruneEntries([['x', null], ['y', {}], ['z', { t: at }]], 5, TTL, at).map(([k]) => k)).toEqual(['z']);
    });
});
