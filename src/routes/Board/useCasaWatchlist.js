// Copyright (C) 2017-2026 Smart code 203358507
//
// Lista "Watchlist" per la riga Continue Watching della home.
// Sorgente: launcher-backend (`/stremio-addon/watchlist`), non il core.
// Il perche' sta in src/common/casaWatchlist.js.

const React = require('react');
const { EVENT, fetchWatchlist } = require('stremio/common/casaWatchlist');

const useCasaWatchlist = () => {
    const [items, setItems] = React.useState([]);

    const reload = React.useCallback(async () => {
        try {
            setItems(await fetchWatchlist());
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

    return items;
};

module.exports = useCasaWatchlist;
