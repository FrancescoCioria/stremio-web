// Copyright (C) 2017-2026 Smart code 203358507

const { missingItems } = require('../src/common/casaHero');
const { pruneEntries } = require('../src/common/casaPersistentCache');

describe('missingItems (hero in blocco)', () => {
    // Tutte le card, non la testa: oltre l'ottava l'hero restava a caricare.
    it('prende TUTTE le card', () => {
        const items = Array.from({ length: 100 }, (_, i) => ({ id: `tt${1000 + i}`, type: 'movie' }));
        expect(missingItems(items)).toHaveLength(100);
    });

    // ⚠️ Lo stesso titolo sta spesso in piu' righe (Continue Watching + Ultime
    // uscite): chiederlo due volte sarebbe traffico buttato.
    it('deduplica fra righe diverse', () => {
        const out = missingItems([{ id: 'tt1', type: 'movie' }, { id: 'tt1', type: 'movie' }, { id: 'tt2', type: 'series' }]);
        expect(out.map((t) => t.key)).toEqual(['movie:tt1', 'series:tt2']);
    });

    // Gli item di Continue Watching sono episodi: `tt123:1:4`. Il backend
    // vuole il titolo padre (la chiave), l'id resta com'e' (lo riduce lui).
    it('riduce un id di episodio al suo titolo', () => {
        expect(missingItems([{ id: 'tt123:1:4', type: 'series' }])[0].key).toBe('series:tt123');
    });

    it('salta gli id non IMDb, i tipi sconosciuti e i buchi', () => {
        const out = missingItems([
            { id: 'kitsu:42', type: 'series' },
            { id: 'tt9', type: null },
            { id: 'tt8', type: 'channel' },
            null,
            { id: 'tt7', type: 'movie' },
        ]);
        expect(out.map((t) => t.key)).toEqual(['movie:tt7']);
    });

    it('usa `_id` quando manca `id` (item di library)', () => {
        expect(missingItems([{ _id: 'tt55', type: 'movie' }])[0]).toEqual({ key: 'movie:tt55', type: 'movie', id: 'tt55' });
    });

    it('lista assente -> niente', () => {
        expect(missingItems(undefined)).toEqual([]);
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
