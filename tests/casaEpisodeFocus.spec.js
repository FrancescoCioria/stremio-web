// Quale stagione si apre e quale episodio prende il focus (casaEpisodeFocus.js).
//
// Ancorato ai 3 casi VERI trovati sulla library il 2026-09-20 (71 serie con
// progresso): Slow Horses (S5 finita 6/6, S6E1 uscito il 16/09), The Bear
// (S4 finita 10/10, S5 tutta uscita), Star Wars: Visions (S2 finita 9/9, S3
// tutta uscita). Le altre 68 non si devono muovere.

const { pickSeason, pickFocusVideo, holdSeason } = require('../src/common/casaEpisodeFocus');

const NOW = Date.parse('2026-09-20T21:00:00Z');
const DAY = 86400000;

// Episodio nella forma che il core produce (vedi casaExtraVideos.js).
const ep = (s, e, { watched = false, progress = 0, daysAgo = 400 } = {}) => ({
    id: `tt5875444:${s}:${e}`,
    season: s,
    episode: e,
    released: new Date(NOW - daysAgo * DAY),
    upcoming: daysAgo < 0,
    watched,
    progress,
});

const seasonsOf = (videos) => [...new Set(videos.map((v) => v.season))].sort((a, b) => a - b);

// Slow Horses al 20/09/2026: S5 vista tutta, S6 con il solo E1 uscito (16/09).
const SLOW_HORSES = [
    ...[1, 2, 3, 4, 5, 6].map((e) => ep(5, e, { watched: true, daysAgo: 400 })),
    ep(6, 1, { daysAgo: 4 }),
    ...[2, 3, 4, 5, 6].map((e) => ep(6, e, { daysAgo: -(e - 1) * 7 })),
];

describe('pickSeason', () => {
    it('il caso Slow Horses: S5 finita, S6E1 uscito -> si apre su S6', () => {
        const r = pickSeason({
            seasons: seasonsOf(SLOW_HORSES), seasonFromUrl: null, videos: SLOW_HORSES,
            resumeVideoId: 'tt5875444:5:6', now: NOW,
        });
        expect(r).toEqual({ season: 6, reason: 'resume-season-finished' });
    });

    it('un mese prima, quando di S6 non era uscito niente -> resta su S5', () => {
        const prima = NOW - 30 * DAY;
        const r = pickSeason({
            seasons: seasonsOf(SLOW_HORSES), seasonFromUrl: null, videos: SLOW_HORSES,
            resumeVideoId: 'tt5875444:5:6', now: prima,
        });
        expect(r).toEqual({ season: 5, reason: 'resume' });
    });

    it('la scelta esplicita dell\'utente (pill/URL) vince sempre', () => {
        const r = pickSeason({
            seasons: seasonsOf(SLOW_HORSES), seasonFromUrl: 5, videos: SLOW_HORSES,
            resumeVideoId: 'tt5875444:5:6', now: NOW,
        });
        expect(r).toEqual({ season: 5, reason: 'url' });
    });

    // Le 68 che non si devono muovere: stagione di ripresa ancora in corso.
    it('stagione a meta\' -> resta dov\'era (comportamento di oggi)', () => {
        const videos = [
            ...[1, 2, 3].map((e) => ep(5, e, { watched: true })),
            ...[4, 5, 6].map((e) => ep(5, e)),
            ep(6, 1, { daysAgo: 4 }),
        ];
        expect(pickSeason({
            seasons: seasonsOf(videos), seasonFromUrl: null, videos,
            resumeVideoId: 'tt5875444:5:3', now: NOW,
        })).toEqual({ season: 5, reason: 'resume' });
    });

    it('un episodio in mezzo non marcato visto -> NON salta (fallimento verso lo status quo)', () => {
        const videos = [
            ep(5, 1, { watched: true }), ep(5, 2), ep(5, 3, { watched: true }),
            ep(6, 1, { daysAgo: 4 }),
        ];
        expect(pickSeason({
            seasons: seasonsOf(videos), seasonFromUrl: null, videos,
            resumeVideoId: 'tt5875444:5:3', now: NOW,
        })).toEqual({ season: 5, reason: 'resume' });
    });

    it('anche la stagione dopo e\' finita -> si va a quella ancora dopo', () => {
        const videos = [
            ...[1, 2].map((e) => ep(5, e, { watched: true })),
            ...[1, 2].map((e) => ep(6, e, { watched: true })),
            ep(7, 1),
        ];
        expect(pickSeason({
            seasons: seasonsOf(videos), seasonFromUrl: null, videos,
            resumeVideoId: 'tt5875444:5:2', now: NOW,
        })).toEqual({ season: 7, reason: 'resume-season-finished' });
    });

    it('niente da vedere piu\' avanti (serie conclusa) -> resta sull\'ultima', () => {
        const videos = [1, 2, 3].map((e) => ep(5, e, { watched: true }));
        expect(pickSeason({
            seasons: seasonsOf(videos), seasonFromUrl: null, videos,
            resumeVideoId: 'tt5875444:5:3', now: NOW,
        })).toEqual({ season: 5, reason: 'resume' });
    });

    // Preso dall'A/B sulla library vera, non da un ragionamento: senza questo
    // la regola scavalcava S3 per atterrare su una stagione vuota.
    it('il caso Foundation: la stagione dopo e\' solo ANNUNCIATA (1 episodio, nessuna data) -> resta su S3', () => {
        const videos = [
            ...[1, 2, 3].map((e) => ep(3, e, { watched: true })),
            { id: 'tt0804484:4:1', season: 4, episode: 1, released: null, upcoming: false, watched: false, progress: 0 },
        ];
        expect(pickSeason({
            seasons: seasonsOf(videos), seasonFromUrl: null, videos,
            resumeVideoId: 'tt5875444:3:3', now: NOW,
        })).toEqual({ season: 3, reason: 'resume' });
    });

    it('un episodio senza data e non visto nella stagione corrente BLOCCA il salto', () => {
        const videos = [
            ep(5, 1, { watched: true }),
            { id: 'tt5875444:5:2', season: 5, episode: 2, released: null, upcoming: false, watched: false, progress: 0 },
            ep(6, 1, { daysAgo: 4 }),
        ];
        expect(pickSeason({
            seasons: seasonsOf(videos), seasonFromUrl: null, videos,
            resumeVideoId: 'tt5875444:5:1', now: NOW,
        })).toEqual({ season: 5, reason: 'resume' });
    });

    it('gli speciali non rubano il focus', () => {
        const videos = [
            ...[1, 2].map((e) => ep(5, e, { watched: true })),
            ep(0, 1),
        ];
        expect(pickSeason({
            seasons: seasonsOf(videos), seasonFromUrl: null, videos,
            resumeVideoId: 'tt5875444:5:2', now: NOW,
        })).toEqual({ season: 5, reason: 'resume' });
    });

    it('l\'ultimo episodio aperto e\' uno SPECIALE -> non si apre sugli Speciali', () => {
        const videos = [ep(0, 1, { watched: true }), ep(1, 1), ep(2, 1)];
        expect(pickSeason({
            seasons: seasonsOf(videos), seasonFromUrl: null, videos,
            resumeVideoId: 'tt5875444:0:1', now: NOW,
        })).toEqual({ season: 1, reason: 'first' });
    });

    it('ma gli Speciali restano scegliibili dalle pill', () => {
        const videos = [ep(0, 1), ep(1, 1)];
        expect(pickSeason({
            seasons: seasonsOf(videos), seasonFromUrl: 0, videos,
            resumeVideoId: 'tt5875444:0:1', now: NOW,
        })).toEqual({ season: 0, reason: 'url' });
    });

    it('REGRESSIONE: serie mai aperta con le stagioni in ordine DECRESCENTE (come le disegna la pagina) -> la 1, non la piu\' recente', () => {
        const videos = [ep(3, 1), ep(2, 1), ep(1, 1), ep(0, 1)];
        expect(pickSeason({
            seasons: [3, 2, 1, 0], seasonFromUrl: null, videos,
            resumeVideoId: null, now: NOW,
        })).toEqual({ season: 1, reason: 'first' });
    });

    it('serie mai aperta -> prima stagione non speciale', () => {
        const videos = [ep(0, 1), ep(1, 1), ep(2, 1)];
        expect(pickSeason({
            seasons: seasonsOf(videos), seasonFromUrl: null, videos,
            resumeVideoId: null, now: NOW,
        })).toEqual({ season: 1, reason: 'first' });
    });

    it('l\'episodio di ripresa non e\' piu\' nel meta: la stagione si legge dall\'id', () => {
        const videos = [...[1, 2].map((e) => ep(5, e, { watched: true })), ep(6, 1)];
        expect(pickSeason({
            seasons: seasonsOf(videos), seasonFromUrl: null, videos,
            resumeVideoId: 'tt5875444:5:99', now: NOW,
        })).toEqual({ season: 6, reason: 'resume-season-finished' });
    });
});

describe('pickFocusVideo', () => {
    it('il bug di stasera: entrando nella stagione nuova, focus sul PRIMO da vedere', () => {
        const s6 = [ep(6, 1, { watched: true, daysAgo: 11 }), ep(6, 2, { daysAgo: 4 }), ep(6, 3, { daysAgo: -3 })];
        // selectedVideoId punta alla stagione VECCHIA: non aggancia qui.
        expect(pickFocusVideo(s6, 'tt5875444:5:6', NOW).id).toBe('tt5875444:6:2');
    });

    it('l\'episodio davvero aperto per ultimo vince su tutto', () => {
        const s5 = [1, 2, 3].map((e) => ep(5, e, { watched: true }));
        expect(pickFocusVideo(s5, 'tt5875444:5:2', NOW).id).toBe('tt5875444:5:2');
    });

    it('uno lasciato a meta\' viene prima del primo non visto', () => {
        const s5 = [ep(5, 1, { watched: true }), ep(5, 2, { progress: 42 }), ep(5, 3)];
        expect(pickFocusVideo(s5, null, NOW).id).toBe('tt5875444:5:2');
    });

    it('un episodio non ancora uscito non prende il focus', () => {
        const s6 = [ep(6, 1, { watched: true, daysAgo: 11 }), ep(6, 2, { daysAgo: -3 })];
        expect(pickFocusVideo(s6, null, NOW).id).toBe('tt5875444:6:1');
    });

    it('stagione tutta vista -> l\'ultimo, non il pilota', () => {
        const s5 = [1, 2, 3].map((e) => ep(5, e, { watched: true }));
        expect(pickFocusVideo(s5, null, NOW).id).toBe('tt5875444:5:3');
    });

    it('stagione tutta futura -> il primo', () => {
        const s7 = [ep(7, 1, { daysAgo: -7 }), ep(7, 2, { daysAgo: -14 })];
        expect(pickFocusVideo(s7, null, NOW).id).toBe('tt5875444:7:1');
    });

    it('lista vuota -> niente', () => {
        expect(pickFocusVideo([], null, NOW)).toBe(null);
    });
});

// La stagione mostrata e' una decisione d'ingresso, non una funzione continua
// degli episodi: `watched` cambia in diretta dal menu della card.
describe('holdSeason', () => {
    const M = 'tt5875444';
    const S = [1, 2, 3];

    it('primo ingresso su un titolo -> si decide (null)', () => {
        expect(holdSeason(null, { metaId: M, seasons: S, seasonFromUrl: null })).toBe(null);
    });

    it('il caso della review: marcare episodi come visti NON cambia stagione', () => {
        const prev = { metaId: M, season: 1 };
        // Stessa chiamata dopo che il core ha riemesso i video con watched=true.
        const r = holdSeason(prev, { metaId: M, seasons: S, seasonFromUrl: null });
        expect(r.decision).toEqual({ season: 1, reason: 'latched' });
        expect(r.next).toBe(prev);
    });

    it('la scelta dalle pill vince sul latch e diventa il nuovo latch', () => {
        const r = holdSeason({ metaId: M, season: 1 }, { metaId: M, seasons: S, seasonFromUrl: 3 });
        expect(r.decision).toEqual({ season: 3, reason: 'url' });
        expect(r.next).toEqual({ metaId: M, season: 3 });
    });

    it('titolo diverso -> si ridecide', () => {
        expect(holdSeason({ metaId: 'tt999', season: 2 }, { metaId: M, seasons: S, seasonFromUrl: null })).toBe(null);
    });

    it('la stagione latchata non esiste piu\' -> si ridecide', () => {
        expect(holdSeason({ metaId: M, season: 9 }, { metaId: M, seasons: S, seasonFromUrl: null })).toBe(null);
    });

    it('nessuna stagione ancora decisa -> si decide', () => {
        expect(holdSeason({ metaId: M, season: null }, { metaId: M, seasons: S, seasonFromUrl: null })).toBe(null);
    });

    it('gli Speciali si possono latchare se scelti dalle pill', () => {
        const r = holdSeason(null, { metaId: M, seasons: [0, 1], seasonFromUrl: 0 });
        expect(r.decision).toEqual({ season: 0, reason: 'url' });
    });
});

// Intestazione di stagione (handoff Claude Design, 2026-09-21).
const { seasonSummary, seasonCountLabel, compareSeasons } = require('../src/common/casaEpisodeFocus');

describe('seasonSummary / seasonCountLabel', () => {
    it('Slow Horses S6 al 20/09: 1 uscito e visto, 5 in arrivo -> "1 di 6 episodi disponibili"', () => {
        const s6 = [ep(6, 1, { watched: true, daysAgo: 4 }), ...[2, 3, 4, 5, 6].map((e) => ep(6, e, { daysAgo: -(e - 1) * 7 }))];
        const s = seasonSummary(s6, NOW);
        expect(s).toMatchObject({ total: 6, available: 1, watched: 1 });
        expect(seasonCountLabel(s)).toBe('1 di 6 episodi disponibili');
    });

    it('stagione tutta uscita e tutta vista -> "tutti visti", non in corso', () => {
        const s5 = [1, 2, 3].map((e) => ep(5, e, { watched: true }));
        const s = seasonSummary(s5, NOW);
        expect(s.inProgress).toBe(false);
        expect(seasonCountLabel(s)).toBe('3 episodi · tutti visti');
    });

    it('IN CORSO = iniziata e con ancora qualcosa di uscito da vedere', () => {
        expect(seasonSummary([ep(5, 1, { watched: true }), ep(5, 2)], NOW).inProgress).toBe(true);
        expect(seasonSummary([ep(5, 1, { progress: 30 }), ep(5, 2)], NOW).inProgress).toBe(true);
    });

    it('REGRESSIONE: una stagione mai iniziata NON e\' in corso (e\' li\' che atterra l\'auto-focus su una serie nuova)', () => {
        expect(seasonSummary([ep(1, 1), ep(1, 2)], NOW).inProgress).toBe(false);
    });

    it('iniziata ma il resto non e\' ancora uscito -> non in corso (non c\'e\' niente da guardare)', () => {
        const s6 = [ep(6, 1, { watched: true, daysAgo: 4 }), ep(6, 2, { daysAgo: -3 })];
        expect(seasonSummary(s6, NOW).inProgress).toBe(false);
    });

    it('REGRESSIONE: episodi visti + segnaposto SENZA DATA -> non e\' in corso (non c\'e\' niente da guardare)', () => {
        const noDate = (e) => ({ id: `tt0804484:4:${e}`, season: 4, episode: e, released: null, upcoming: false, watched: false, progress: 0 });
        const s4 = [ep(4, 1, { watched: true }), ep(4, 2, { watched: true }), noDate(3)];
        expect(seasonSummary(s4, NOW).inProgress).toBe(false);
    });

    it('ma nel CONTATORE un episodio senza data resta disponibile (le serie vecchie spesso le date non le hanno)', () => {
        const noDate = (e) => ({ id: `tt1:1:${e}`, season: 1, episode: e, released: null, upcoming: false, watched: false, progress: 0 });
        expect(seasonCountLabel(seasonSummary([noDate(1), noDate(2)], NOW))).toBe('2 episodi');
    });

    it('un episodio solo -> singolare', () => {
        expect(seasonCountLabel(seasonSummary([ep(1, 1)], NOW))).toBe('1 episodio');
    });

    it('extra -> "N extra"', () => {
        expect(seasonCountLabel(seasonSummary([ep(0, 1), ep(0, 2)], NOW), { extra: true })).toBe('2 extra');
    });
});

describe('compareSeasons', () => {
    it('la piu\' recente in alto, gli extra (0) sempre in fondo', () => {
        expect([1, 0, 3, 2, 6].sort(compareSeasons)).toEqual([6, 3, 2, 1, 0]);
    });
});
