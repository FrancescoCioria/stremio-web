// Copyright (C) 2017-2026 Smart code 203358507

// Porta in anticipo cio' che l'hero della home mostra al focus, per TUTTI i
// titoli delle righe disegnate + Continua a guardare: una richiesta al backend
// (`common/casaHero.js`, `hero.ts`), che risponde dalla sua cache SQLite.
//
// ⚠️ Fino alla v4.161 si scaldava solo la TESTA di ogni riga (8 card), dalla
// tile, a concorrenza 3: tre chiamate per card, una verso Cinemeta. Oltre
// l'ottava card l'hero restava a caricare al focus, anche secondi (Cinemeta p90
// ~2 s). Ora il lavoro lo fa il backend e la tile fa una POST.

const React = require('react');
const { loadHeroes } = require('stremio/common/casaHero');

// Le righe arrivano a pezzi (il core le carica una per volta): si aspetta che
// si fermino invece di mandare una richiesta per pezzo. Ogni giro chiede solo
// i titoli che mancano.
const SETTLE_MS = 400;

const useCasaPrefetch = (catalogs, continueWatchingItems) => {
    React.useEffect(() => {
        const timer = setTimeout(() => {
            // Righe non ancora caricate: niente (arriveranno col prossimo giro).
            const rows = (catalogs ?? []).map((c) => (c?.content?.type === 'Ready' ? c.content.content : []));
            // Best-effort: senza blocco l'hero chiede il titolo al focus.
            // Filtro, doppioni e "gia' in mano" li decide casaHero.
            loadHeroes([...(continueWatchingItems ?? []), ...rows.flat()]).catch(() => null);
        }, SETTLE_MS);
        return () => clearTimeout(timer);
    }, [catalogs, continueWatchingItems]);
};

module.exports = useCasaPrefetch;
