// Copyright (C) 2017-2026 Smart code 203358507
//
// Lista "Watchlist" per la riga Continue Watching della home.
// Sorgente: launcher-backend (`/stremio-addon/watchlist`), non il core.
// Il perche' sta in src/common/casaWatchlist.js.

const React = require('react');
const { EVENT, fetchWatchlist, normalizeWatchlist } = require('stremio/common/casaWatchlist');
const { PersistentCache } = require('stremio/common/casaPersistentCache');

const EMPTY = { items: [], activity: {}, awaiting: [] };

// Ultima risposta del backend, per il PRIMO disegno della riga.
//
// ⚠️ Senza, le nostre card (Watchlist, "in attesa del prossimo episodio")
// entravano nella riga DOPO che la home era gia' disegnata: la riga del core
// e' pronta subito, la nostra risposta arriva quando il backend ha finito
// library + Cinemeta + TMDB, a freddo dopo ore di tile spenta. Visto il
// 14/09/2026: X Factor che compare al 2o posto a app gia' aperta e sposta
// tutte le card dietro. Con la copia la riga nasce gia' completa; il fetch la
// rinfresca e cambia qualcosa solo se la verita' e' cambiata (episodio uscito,
// titolo iniziato), che e' raro e giustificato.
//
// 7 giorni: oltre, la copia descrive una casa che non c'e' piu' e si parte a
// freddo come prima.
const lastResponse = new PersistentCache('watchlist', { ttlMs: 7 * 24 * 60 * 60 * 1000, maxEntries: 1 });
const LAST = 'last';

const initialState = () => {
    const saved = lastResponse.get(LAST);
    return saved ? normalizeWatchlist(saved) : EMPTY;
};

const useCasaWatchlist = () => {
    // `items` = la lista; `activity` = ultima visione per titolo della library,
    // che serve a INSERIRE gli item al posto giusto nella riga (vedi
    // mergeWatchlist). Un oggetto solo: arrivano insieme e si usano insieme.
    const [state, setState] = React.useState(initialState);

    const reload = React.useCallback(async () => {
        try {
            const list = await fetchWatchlist();
            setState(list);
            lastResponse.set(LAST, list);
        } catch (_e) {
            // Backend giu' o non raggiungibile: la riga resta quella del core.
            // Mai svuotare cio' che si sta gia' mostrando per un errore di rete:
            // farebbe sparire card sotto gli occhi mentre si naviga.
        }
    }, []);

    React.useEffect(() => {
        let alive = true;
        const run = () => { if (alive) void reload(); };
        run();
        // Un'aggiunta dal menu contestuale deve comparire SUBITO: dal divano,
        // un ritardo indefinito fra il gesto e la card si legge come "non ha
        // funzionato", e si riprova (o si rinuncia).
        window.addEventListener(EVENT, run);
        // La home NON si rimonta cambiando rotta (il router le mette solo
        // display:none): senza questo, tornando da Settings/Library la lista
        // resterebbe quella di quando la tile e' partita. Stesso motivo per cui
        // Board ha gia' un IntersectionObserver per il focus.
        document.addEventListener('visibilitychange', run);
        return () => {
            alive = false;
            window.removeEventListener(EVENT, run);
            document.removeEventListener('visibilitychange', run);
        };
    }, [reload]);

    return state;
};

module.exports = useCasaWatchlist;
