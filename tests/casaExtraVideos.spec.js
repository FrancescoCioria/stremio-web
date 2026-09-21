// Righe episodio per quello che Cinemeta non elenca (casaExtraVideos.js).
//
// Il contratto che questi casi ancorano: si AGGIUNGE soltanto, mai si tocca
// quello che il core gia' ha — e appena il core elenca l'episodio la nostra
// riga sparisce da sola (se no si vedrebbe doppia proprio nel giorno in cui
// il ritardo di TVDB rientra).

const { buildCasaVideo, mergeCasaExtraVideos, libraryProgress } = require('../src/common/casaExtraVideos');

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
