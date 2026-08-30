// Copyright (C) 2017-2026 Smart code 203358507

// Scalda in anticipo le info che l'hero della home mostra al focus: metadati
// Cinemeta, voto Letterboxd, disponibilita' (pill "Al Cinema"/"Prime").
//
// ⚠️ Il problema che risolve: quelle chiamate partivano SOLO al focus, quindi
// muovendosi fra le card si vedeva la riga dell'hero riempirsi a pezzi. Ma le
// liste della home le conosciamo gia' quando la home si disegna — non c'e'
// nessun motivo di aspettare che l'utente ci passi sopra.
//
// ⚠️ Non e' un "scarica tutto": si scalda solo la TESTA di ogni riga (le card
// che l'utente vede senza scorrere) e con una concorrenza bassa, perche' questa
// roba non deve mai competere con la riproduzione o con il disegno della UI.
// Il resto arriva al focus come prima — con la cache persistente, una volta
// sola nella vita.

const React = require('react');
const { warmMeta } = require('stremio/common/casaMetaCache');
const { warmLetterboxd } = require('stremio/common/useLetterboxdRating');
const { warmAvailability } = require('stremio/common/useTitleAvailability');
const { prefetchTargets } = require('./casaPrefetchTargets');

// Quante card per riga. 8 copre la prima schermata di una riga su TV.
const HEAD_PER_ROW = 8;
// Concorrenza volutamente bassa: e' lavoro di sfondo.
const CONCURRENCY = 3;
// Ritardo prima di iniziare: la home deve prima disegnarsi.
const START_DELAY_MS = 1500;

const runPool = async (items, concurrency, fn, isCancelled) => {
    let i = 0;
    const worker = async () => {
        while (i < items.length && !isCancelled()) {
            const item = items[i++];
            try {
                await fn(item);
            } catch (_e) {
                // Best-effort: una card non scaldata non e' un errore.
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
};

const useCasaPrefetch = (catalogs, continueWatchingItems) => {
    React.useEffect(() => {
        let cancelled = false;
        const isCancelled = () => cancelled;
        const timer = setTimeout(() => {
            const cw = { content: { type: 'Ready', content: continueWatchingItems ?? [] } };
            const targets = prefetchTargets([cw, ...(catalogs ?? [])], HEAD_PER_ROW);
            if (targets.length === 0) return;
            void runPool(targets, CONCURRENCY, async ({ type, imdb, id }) => {
                await warmMeta(type, id);
                if (type === 'movie') await warmLetterboxd(imdb);
                await warmAvailability(type, imdb);
            }, isCancelled);
        }, START_DELAY_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // Le righe cambiano quando il core ne carica altre: si riparte, ma i
        // titoli gia' scaldati escono subito dalla cache.
    }, [catalogs, continueWatchingItems]);
};

module.exports = useCasaPrefetch;
