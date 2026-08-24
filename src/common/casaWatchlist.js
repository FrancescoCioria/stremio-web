// Copyright (C) 2017-2026 Smart code 203358507
//
// "Guarda dopo" — client della lista servita dal launcher-backend
// (`/stremio-addon/watchlist`, vedi launcher/backend/src/watchlist.ts).
//
// ⚠️ NON e' la library Stremio, ed e' deliberato. Misurato sull'account reale:
// la library ha 58 item vivi a progresso zero che sono la lista di ANNI fa
// (Akira, Heat, Jackie Brown...), indistinguibili dalle intenzioni di oggi
// perche' `ctime` e' undefined su tutti. Derivare la riga da li' avrebbe messo
// 58 film vecchi sopra i 3 veri di Continue Watching.
//
// ⚠️ NON si puo' fare col core: `is_in_continue_watching()` e'
//     type != "other" && (!removed || temp) && state.time_offset > 0
// e non esiste ActionCtx per scrivere il progresso da fuori. Per questo finora
// l'unico modo era far partire il video e fermarlo subito.

const { casaBackendUrl } = require('./casaBackend');

// Gli item di "Guarda dopo" vivono nella riga Continue Watching insieme a
// quelli del core: questo flag e' l'unico modo di distinguerli a valle (il
// dismiss del core dispatcha RewindLibraryItem su un id che nella library non
// esiste, quindi NON va usato sui nostri).
const CASA_WATCHLIST = 'casaWatchlist';

// Bus di aggiornamento: MetaItem aggiunge/toglie, il Board deve rinfrescare
// SUBITO. Senza, la card comparirebbe al prossimo giro di polling — cioe' un
// tempo indefinito dopo il gesto, che dal divano si legge come "non ha funzionato".
const EVENT = 'casa-watchlist-changed';

const notifyChanged = () => {
    try {
        window.dispatchEvent(new CustomEvent(EVENT));
    } catch (_e) { /* fuori dal browser (test node) */ }
};

// Forma da riga Continue Watching. `progress: 0` e nessun deepLink `player`:
// un titolo mai iniziato non ha un punto da cui riprendere, quindi il click
// deve portare al dettaglio (dove si sceglie lo stream), non al player.
const toRowItem = (entry) => ({
    _id: entry.id,
    id: entry.id,
    type: entry.type,
    name: entry.name,
    poster: entry.poster,
    posterShape: entry.posterShape || 'poster',
    progress: 0,
    watched: false,
    // `#/metadetails/<type>/<id>`: la stessa forma che MetaRow costruisce a
    // mano per gli item extra dei cataloghi.
    deepLinks: {
        metaDetailsVideos: '#/metadetails/' +
            encodeURIComponent(entry.type) + '/' + encodeURIComponent(entry.id),
    },
    [CASA_WATCHLIST]: true,
});

// Fonde "Guarda dopo" in coda a Continue Watching, senza duplicati.
//
// ⚠️ La de-duplica non e' teorica: appena si guarda un secondo di un titolo il
// core lo mette in Continue Watching da solo, mentre il backend se ne accorge
// solo alla prossima riconciliazione (la library e' in cache 1h). In quella
// finestra lo stesso titolo sta in ENTRAMBE le liste, e senza questo filtro
// comparirebbe due volte nella stessa riga. Vince sempre la copia del core:
// e' quella con il progresso vero.
//
// I nostri vanno DOPO: chi ha qualcosa a meta' vuole riprenderlo, non scorrere
// oltre le intenzioni.
const mergeWatchlist = (continueWatchingItems, watchlistEntries) => {
    const cw = Array.isArray(continueWatchingItems) ? continueWatchingItems : [];
    const wl = Array.isArray(watchlistEntries) ? watchlistEntries : [];
    if (wl.length === 0) return cw;
    const seen = new Set(cw.map((i) => i && (i._id || i.id)).filter(Boolean));
    const extra = wl
        .filter((e) => e && typeof e.id === 'string' && !seen.has(e.id))
        .map(toRowItem);
    return extra.length > 0 ? [...cw, ...extra] : cw;
};

const fetchWatchlist = async () => {
    const url = casaBackendUrl('/stremio-addon/watchlist');
    if (!url) return [];
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j && j.items) ? j.items : [];
};

// `item` = una card qualunque (catalogo, ricerca, library): servono id e type,
// il resto e' cosmetico e serve solo a disegnare la card prima che Cinemeta
// risponda.
const addToWatchlist = async (item) => {
    const url = casaBackendUrl('/stremio-addon/watchlist');
    if (!url || !item || typeof item.id !== 'string' || typeof item.type !== 'string') return false;
    try {
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                id: item.id,
                type: item.type,
                name: item.name || null,
                poster: item.poster || null,
                posterShape: item.posterShape || null,
            }),
        });
        if (r.ok) notifyChanged();
        return r.ok;
    } catch (_e) {
        return false;
    }
};

const removeFromWatchlist = async (id) => {
    const url = casaBackendUrl('/stremio-addon/watchlist/' + encodeURIComponent(id));
    if (!url || typeof id !== 'string') return false;
    try {
        const r = await fetch(url, { method: 'DELETE' });
        if (r.ok) notifyChanged();
        return r.ok;
    } catch (_e) {
        return false;
    }
};

module.exports = {
    CASA_WATCHLIST,
    EVENT,
    toRowItem,
    mergeWatchlist,
    fetchWatchlist,
    addToWatchlist,
    removeFromWatchlist,
};
