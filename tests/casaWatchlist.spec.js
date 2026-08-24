// Copyright (C) 2017-2026 Smart code 203358507

const { mergeWatchlist, toRowItem, CASA_WATCHLIST } = require('../src/common/casaWatchlist');

const cwItem = (id, extra) => Object.assign({ _id: id, name: id, progress: 0.4 }, extra);
const entry = (id, extra) => Object.assign({ id, type: 'movie', name: id, poster: null, addedAt: 0 }, extra);

describe('toRowItem', () => {
    it('non espone un deepLink player: un titolo mai iniziato non ha da dove riprendere', () => {
        const it = toRowItem(entry('tt1'));
        expect(it.deepLinks.player).toBeUndefined();
        expect(it.deepLinks.metaDetailsVideos).toBe('#/metadetails/movie/tt1');
    });

    it('progresso zero e non visto: la barra non deve mentire', () => {
        const it = toRowItem(entry('tt1'));
        expect(it.progress).toBe(0);
        expect(it.watched).toBe(false);
    });

    it('marca l item cosi che il Board non gli attacchi il dismiss del core', () => {
        // Il dismiss del core dispatcha RewindLibraryItem su un id che nella
        // library NON esiste: sui nostri item non va usato.
        expect(toRowItem(entry('tt1'))[CASA_WATCHLIST]).toBe(true);
    });

    it('posterShape ha un default: senza, la card si disegna storta', () => {
        expect(toRowItem(entry('tt1')).posterShape).toBe('poster');
        expect(toRowItem(entry('tt1', { posterShape: 'landscape' })).posterShape).toBe('landscape');
    });
});

const DAY = 24 * 60 * 60 * 1000;
const T = (d) => Date.parse(`2026-08-${String(d).padStart(2, '0')}T12:00:00Z`);

describe('mergeWatchlist', () => {
    it('appena aggiunto sta in cima', () => {
        const cw = [cwItem('tt_a'), cwItem('tt_b')];
        const activity = { tt_a: T(23), tt_b: T(21) };
        const out = mergeWatchlist(cw, [entry('tt_wl', { addedAt: T(24) })], activity);
        expect(out.map((i) => i._id)).toEqual(['tt_wl', 'tt_a', 'tt_b']);
    });

    it('se lo ignoro SCENDE da solo man mano che guardo altro', () => {
        // Stessa lista, stessa data di aggiunta: cambia solo che nel frattempo
        // sono state guardate altre cose. Nessuna posizione privilegiata a vita.
        const wl = [entry('tt_wl', { addedAt: T(20) })];
        const cw = [cwItem('tt_a'), cwItem('tt_b'), cwItem('tt_c')];
        expect(mergeWatchlist(cw, wl, { tt_a: T(19), tt_b: T(18), tt_c: T(17) })
            .map((i) => i._id)).toEqual(['tt_wl', 'tt_a', 'tt_b', 'tt_c']);
        expect(mergeWatchlist(cw, wl, { tt_a: T(22), tt_b: T(18), tt_c: T(17) })
            .map((i) => i._id)).toEqual(['tt_a', 'tt_wl', 'tt_b', 'tt_c']);
        expect(mergeWatchlist(cw, wl, { tt_a: T(23), tt_b: T(22), tt_c: T(21) })
            .map((i) => i._id)).toEqual(['tt_a', 'tt_b', 'tt_c', 'tt_wl']);
    });

    it('NON riordina la riga del core', () => {
        // Il core non la ordina per lastWatched: le serie con notifiche di nuovi
        // episodi le mette per data di uscita (es. Silo, 7 notifiche, 3o posto
        // con lastWatched di luglio). Noi inseriamo e basta.
        const cw = [cwItem('tt_a'), cwItem('tt_silo'), cwItem('tt_b')];
        const activity = { tt_a: T(23), tt_silo: T(4), tt_b: T(19) };
        const out = mergeWatchlist(cw, [entry('tt_wl', { addedAt: T(1) })], activity);
        expect(out.filter((i) => i._id !== 'tt_wl').map((i) => i._id))
            .toEqual(['tt_a', 'tt_silo', 'tt_b']);
    });

    it('piu\' item mantengono fra loro l ordine per data di aggiunta', () => {
        const cw = [cwItem('tt_a')];
        const out = mergeWatchlist(cw,
            [entry('tt_vecchio', { addedAt: T(10) }), entry('tt_nuovo', { addedAt: T(22) })],
            { tt_a: T(5) });
        expect(out.map((i) => i._id)).toEqual(['tt_nuovo', 'tt_vecchio', 'tt_a']);
    });

    it('senza timestamp usabili PREPENDE, mai accoda', () => {
        // In coda non si vedrebbero: la riga del core ha 25+ item e MetaRow
        // taglia a TV_PREVIEW_SIZE (25). Backend vecchio / fetch fallita / library
        // non pronta devono degradare in "visibile", non in "invisibile".
        const cw = Array.from({ length: 25 }, (_, i) => cwItem('tt_cw' + i));
        for (const act of [undefined, {}, { sconosciuto: 123 }]) {
            const out = mergeWatchlist(cw, [entry('tt_wl', { addedAt: T(24) })], act);
            expect(out.slice(0, 25).map((i) => i._id)).toContain('tt_wl');
        }
    });

    it('un item senza timestamp non si porta dietro tutta la watchlist', () => {
        const cw = [cwItem('tt_noto'), cwItem('tt_ignoto'), cwItem('tt_vecchio')];
        const out = mergeWatchlist(cw, [entry('tt_wl', { addedAt: T(20) })],
            { tt_noto: T(23), tt_vecchio: T(5) });
        expect(out.map((i) => i._id)).toEqual(['tt_noto', 'tt_ignoto', 'tt_wl', 'tt_vecchio']);
    });

    it('NON duplica un titolo presente in entrambe le liste', () => {
        // Caso reale: appena guardi un secondo il core lo mette in Continue
        // Watching, ma il backend se ne accorge solo alla riconciliazione
        // successiva (library in cache 1h). In quella finestra sta in tutte e due.
        const out = mergeWatchlist([cwItem('tt_x')], [entry('tt_x')], { tt_x: T(20) });
        expect(out).toHaveLength(1);
        expect(out[0].progress).toBe(0.4); // vince la copia del core, col progresso vero
    });

    it('de-duplica anche quando il core espone `id` invece di `_id`', () => {
        expect(mergeWatchlist([{ id: 'tt_x', name: 'x' }], [entry('tt_x')], {})).toHaveLength(1);
    });

    it('lista vuota -> ritorna ESATTAMENTE l array del core', () => {
        const cw = [cwItem('tt_cw')];
        expect(mergeWatchlist(cw, [], {})).toBe(cw);
    });

    it('continue watching vuoto -> restano solo i nostri', () => {
        expect(mergeWatchlist([], [entry('tt_wl')], {}).map((i) => i._id)).toEqual(['tt_wl']);
    });

    it('regge input non validi senza esplodere', () => {
        expect(mergeWatchlist(null, null, null)).toEqual([]);
        expect(mergeWatchlist([cwItem('a')], [null, { noId: true }], {})).toHaveLength(1);
    });
});
