// Righe episodio per quello che Cinemeta non elenca (casaExtraVideos.js).
//
// Il contratto che questi casi ancorano: si AGGIUNGE soltanto, mai si tocca
// quello che il core gia' ha — e appena il core elenca l'episodio la nostra
// riga sparisce da sola (se no si vedrebbe doppia proprio nel giorno in cui
// il ritardo di TVDB rientra).

const { buildCasaVideo, mergeCasaExtraVideos, libraryProgress, extraWatchedState, autoWatchedIds, migrationPlan, seasonWriteSplit } = require('../src/common/casaExtraVideos');

const META = 'tt1194223';
const CORE_E1 = { id: 'tt1194223:20:1', title: 'Episode 1', season: 20, episode: 1, watched: true };
const EXTRA_E2 = {
    id: 'tt1194223:20:2',
    season: 20,
    episode: 2,
    title: 'Audizioni. 2a parte',
    released: '2026-09-17',
    thumbnail: null,
};

describe('mergeCasaExtraVideos', () => {
    test('aggiunge in coda la riga mancante, senza toccare quelle del core', () => {
        const out = mergeCasaExtraVideos([CORE_E1], [EXTRA_E2], META);
        expect(out).toHaveLength(2);
        expect(out[0]).toBe(CORE_E1);
        expect(out[1].id).toBe('tt1194223:20:2');
        expect(out[1].episode).toBe(2);
    });

    // ⚠️ Il giorno in cui Cinemeta si aggiorna il backend (cache 12h) dice
    // ancora "manca": senza questo dedup si vedrebbe la riga DOPPIA.
    test('se il core ce l\'ha gia\', la nostra non entra', () => {
        const core = [CORE_E1, { id: 'tt1194223:20:2', title: 'Episode 2' }];
        expect(mergeCasaExtraVideos(core, [EXTRA_E2], META)).toBe(core);
    });

    test('niente extra -> la lista e\' la stessa, identica', () => {
        const core = [CORE_E1];
        expect(mergeCasaExtraVideos(core, [], META)).toBe(core);
        expect(mergeCasaExtraVideos(core, null, META)).toBe(core);
    });

    test('senza metaId non si inventa nessun link', () => {
        const core = [CORE_E1];
        expect(mergeCasaExtraVideos(core, [EXTRA_E2], null)).toBe(core);
    });
});

describe('buildCasaVideo', () => {
    // ⚠️ Video.js fa `released instanceof Date`: una stringa mostrerebbe la
    // card senza data, senza nessun errore.
    test('released e\' un Date, e il link porta alla pagina stream', () => {
        const v = buildCasaVideo(META, EXTRA_E2);
        expect(v.released instanceof Date).toBe(true);
        expect(v.released.getUTCFullYear()).toBe(2026);
        expect(v.deepLinks.metaDetailsStreams).toBe('#/detail/series/tt1194223/tt1194223%3A20%3A2');
    });

    // ⚠️ Senza immagine Video.js non disegna il riquadro e la card sembra
    // rotta accanto alle altre: si ripiega sullo sfondo della serie.
    test('senza still TMDB ripiega sullo sfondo della serie', () => {
        const v = buildCasaVideo(META, EXTRA_E2, 'https://img/bg.jpg');
        expect(v.thumbnail).toBe('https://img/bg.jpg');
        const own = buildCasaVideo(META, { ...EXTRA_E2, thumbnail: 'https://img/still.jpg' }, 'https://img/bg.jpg');
        expect(own.thumbnail).toBe('https://img/still.jpg');
    });

    test('senza data la card si fa lo stesso (released null, mai Invalid Date)', () => {
        const v = buildCasaVideo(META, { ...EXTRA_E2, released: null });
        expect(v.released).toBeNull();
        const bad = buildCasaVideo(META, { ...EXTRA_E2, released: 'non-una-data' });
        expect(bad.released).toBeNull();
    });
});

// Il visto della riga extra, ricostruito dalla library (il bitfield del core
// non ha una casella per un episodio che Cinemeta non elenca).
// Stato VERO di X Factor il 2026-09-21: S20E02 guardata la sera prima.
const XF_STATE = {
    lastWatched: '2026-09-20T19:24:56.479Z',
    timeWatched: 7344554, timeOffset: 0, duration: 8635050,
    timesWatched: 13, flaggedWatched: 1,
    video_id: 'tt1194223:20:2',
};

describe('libraryProgress (visto della riga extra)', () => {
    it('X Factor S20E02: offset azzerato dopo 122 min su 144 -> VISTA', () => {
        expect(libraryProgress(XF_STATE, 'tt1194223:20:2')).toEqual({ watched: true, progress: 0 });
    });
    it('lasciata a meta\' -> progresso da offset/durata', () => {
        const st = { ...XF_STATE, timeOffset: 4317525 };
        const r = libraryProgress(st, 'tt1194223:20:2');
        expect(r.watched).toBe(false);
        expect(Math.round(r.progress)).toBe(50);
    });
    it('un altro episodio (non l\'ultimo aperto) -> nessuna informazione', () => {
        expect(libraryProgress(XF_STATE, 'tt1194223:20:3')).toBe(null);
    });
    it('aperta ma mai riprodotta (timeWatched 0) -> non vista', () => {
        expect(libraryProgress({ ...XF_STATE, timeWatched: 0 }, 'tt1194223:20:2')).toBe(null);
    });
    it('niente library (ospite) -> nessuna informazione', () => {
        expect(libraryProgress(null, 'tt1194223:20:2')).toBe(null);
    });
    it('il merge la marca vista', () => {
        const out = mergeCasaExtraVideos([], [{ id: 'tt1194223:20:2', season: 20, episode: 2, title: 'Puntata 2', released: '2026-09-17T19:00:00.000Z' }], 'tt1194223', null, XF_STATE);
        expect(out[0].watched).toBe(true);
    });
});

// UNA decisione del visto per la riga extra: flag del backend + library.
// Il caso vero: X Factor S20, Cinemeta elenca solo E01; E02 ed E03 guardati,
// l'ultimo aperto e' E03 -> senza il flag E02 risultava NON visto.
const XF = 'tt1194223';
const E = (n) => ({ id: `${XF}:20:${n}`, season: 20, episode: n, title: `Puntata ${n}`, released: '2026-09-17T19:00:00.000Z' });
const LAST_MS = Date.parse(XF_STATE.lastWatched);

describe('extraWatchedState', () => {
    it('flag visto -> visto, anche se non e\' l\'ultimo aperto', () => {
        expect(extraWatchedState(`${XF}:20:3`, { watched: true, ts: 1, source: 'user' }, XF_STATE))
            .toEqual({ watched: true, progress: 0, from: 'flag' });
    });
    it('nessun flag + library dice finito -> visto, da fissare (from library)', () => {
        expect(extraWatchedState(`${XF}:20:2`, null, XF_STATE)).toEqual({ watched: true, progress: 0, from: 'library' });
    });
    it('nessun flag + nessuna traccia -> non visto', () => {
        expect(extraWatchedState(`${XF}:20:3`, null, XF_STATE)).toEqual({ watched: false, progress: 0, from: null });
    });
    // "Togli il visto" sull'ultimo aperto: la ricostruzione NON deve rimetterlo.
    it('flag NON visto piu\' recente della visione -> resta non visto', () => {
        const r = extraWatchedState(`${XF}:20:2`, { watched: false, ts: LAST_MS + 1000, source: 'user' }, XF_STATE);
        expect(r.watched).toBe(false);
        expect(r.from).toBe('flag');
    });
    // ...ma se poi lo riguarda fino in fondo, vince la visione (piu' recente).
    it('flag NON visto piu\' vecchio della visione -> visto dalla library', () => {
        expect(extraWatchedState(`${XF}:20:2`, { watched: false, ts: LAST_MS - 1000, source: 'user' }, XF_STATE))
            .toEqual({ watched: true, progress: 0, from: 'library' });
    });
    it('flag NON visto e lastWatched assente -> vince il flag', () => {
        const st = { ...XF_STATE, lastWatched: undefined };
        expect(extraWatchedState(`${XF}:20:2`, { watched: false, ts: 5, source: 'user' }, st).watched).toBe(false);
    });
    it('flag visto + lasciato a meta\' dopo: resta visto, col progresso', () => {
        const st = { ...XF_STATE, timeOffset: 4317525 };
        const r = extraWatchedState(`${XF}:20:2`, { watched: true, ts: 1, source: 'auto' }, st);
        expect(r.watched).toBe(true);
        expect(Math.round(r.progress)).toBe(50);
    });
});

describe('merge con i flag', () => {
    it('X Factor: E02 dal flag, E03 dalla library, E04 non visto; marcati con la fonte', () => {
        const st = { ...XF_STATE, video_id: `${XF}:20:3` };
        const flags = { [`${XF}:20:2`]: { watched: true, ts: 1, source: 'auto' } };
        const out = mergeCasaExtraVideos([CORE_E1], [E(2), E(3), E(4)], XF, null, st, flags);
        expect(out.map((v) => [v.id, v.watched, v.casaWatchedFrom])).toEqual([
            [`${XF}:20:1`, true, undefined],
            [`${XF}:20:2`, true, 'flag'],
            [`${XF}:20:3`, true, 'library'],
            [`${XF}:20:4`, false, null],
        ]);
        expect(out[1].casaMetaId).toBe(XF);
        expect(autoWatchedIds(out)).toEqual([`${XF}:20:3`]);
    });
    it('il core non e\' mai toccato: un suo video non visto resta com\'e\' anche con un flag omonimo', () => {
        const core = [{ ...CORE_E1, watched: false }];
        const out = mergeCasaExtraVideos(core, [E(2)], XF, null, null, { [CORE_E1.id]: { watched: true, ts: 1, source: 'user' } });
        expect(out[0]).toBe(core[0]);
    });
});

describe('autoWatchedIds', () => {
    it('solo righe extra viste per la library', () => {
        const vs = [
            { id: 'a', casaExtra: true, watched: true, casaWatchedFrom: 'library' },
            { id: 'b', casaExtra: true, watched: true, casaWatchedFrom: 'flag' },
            { id: 'c', casaExtra: true, watched: false, casaWatchedFrom: null },
            { id: 'd', watched: true },
        ];
        expect(autoWatchedIds(vs)).toEqual(['a']);
        expect(autoWatchedIds(null)).toEqual([]);
    });
});

describe('migrationPlan (Cinemeta aggiunge l\'episodio)', () => {
    const flags = {
        [`${XF}:20:2`]: { watched: true, ts: 1, source: 'auto' },
        [`${XF}:20:3`]: { watched: true, ts: 1, source: 'migrated' },
        [`${XF}:20:4`]: { watched: false, ts: 1, source: 'user' },
        [`${XF}:20:5`]: { watched: true, ts: 1, source: 'user' },
    };
    it('flag visto + core non visto -> dispatch; gia\' visto -> confirm; migrated / non visto / non elencato -> niente', () => {
        const core = [
            CORE_E1,
            { ...E(2), watched: false },
            { ...E(3), watched: false },
            { ...E(4), watched: false },
        ];
        const plan = migrationPlan(core, flags);
        expect(plan.dispatch.map((v) => v.id)).toEqual([`${XF}:20:2`]);
        expect(plan.confirm).toEqual([]);
        expect(migrationPlan([{ ...E(2), watched: true }], flags)).toEqual({ dispatch: [], confirm: [`${XF}:20:2`] });
    });
    it('senza flag (backend giu\') -> niente', () => {
        expect(migrationPlan([{ ...E(2), watched: false }], null)).toEqual({ dispatch: [], confirm: [] });
    });
});

describe('seasonWriteSplit', () => {
    it('S20: il core per E01, il backend per le extra della stagione e basta', () => {
        const vs = [CORE_E1, { ...E(2), casaExtra: true }, { ...E(3), casaExtra: true }, { id: `${XF}:19:9`, season: 19, casaExtra: true }];
        expect(seasonWriteSplit(vs, 20)).toEqual({ core: true, extraIds: [`${XF}:20:2`, `${XF}:20:3`] });
    });
    it('stagione di sole extra -> niente core', () => {
        expect(seasonWriteSplit([{ ...E(2), season: 21, casaExtra: true }], 21)).toEqual({ core: false, extraIds: [`${XF}:20:2`] });
    });
});
