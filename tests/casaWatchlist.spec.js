// Copyright (C) 2017-2026 Smart code 203358507

const { mergeWatchlist, toRowItem, CASA_WATCHLIST } = require('../src/common/casaWatchlist');

const cwItem = (id, extra) => Object.assign({ _id: id, name: id, progress: 0.4 }, extra);
const entry = (id, extra) => Object.assign({ id, type: 'movie', name: id, poster: null }, extra);

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

describe('mergeWatchlist', () => {
    it('mette "Watchlist" PRIMA del continue watching vero', () => {
        // In coda non si vedrebbero: la riga del core contiene anche le serie
        // con notifiche di nuovi episodi (25+ in casa) e MetaRow taglia a 25.
        const out = mergeWatchlist([cwItem('tt_cw')], [entry('tt_wl')]);
        expect(out.map((i) => i._id)).toEqual(['tt_wl', 'tt_cw']);
    });

    it('resta visibile anche con la riga del core gia\' oltre il taglio di MetaRow', () => {
        // Caso REALE: 25 item nel continue watching -> un item accodato finirebbe
        // in posizione 26 e non verrebbe mai disegnato.
        const cw = Array.from({ length: 25 }, (_, i) => cwItem('tt_cw' + i));
        const out = mergeWatchlist(cw, [entry('tt_wl')]);
        expect(out.slice(0, 25).map((i) => i._id)).toContain('tt_wl');
    });

    it('NON duplica un titolo presente in entrambe le liste', () => {
        // Caso reale, non teorico: appena guardi un secondo il core lo mette in
        // Continue Watching, ma il backend se ne accorge solo alla prossima
        // riconciliazione (library in cache 1h). In quella finestra sta in
        // tutte e due.
        const out = mergeWatchlist([cwItem('tt_x')], [entry('tt_x')]);
        expect(out).toHaveLength(1);
        expect(out[0].progress).toBe(0.4); // vince la copia del core, quella col progresso vero
    });

    it('de-duplica anche quando il core espone `id` invece di `_id`', () => {
        const out = mergeWatchlist([{ id: 'tt_x', name: 'x' }], [entry('tt_x')]);
        expect(out).toHaveLength(1);
    });

    it('lista vuota -> ritorna ESATTAMENTE l array del core (nessuna copia inutile)', () => {
        const cw = [cwItem('tt_cw')];
        expect(mergeWatchlist(cw, [])).toBe(cw);
    });

    it('continue watching vuoto -> restano solo i nostri', () => {
        const out = mergeWatchlist([], [entry('tt_wl')]);
        expect(out.map((i) => i._id)).toEqual(['tt_wl']);
    });

    it('regge input non validi senza esplodere', () => {
        expect(mergeWatchlist(null, null)).toEqual([]);
        expect(mergeWatchlist([cwItem('a')], [null, { noId: true }])).toHaveLength(1);
    });
});
