// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const classnames = require('classnames');
const debounce = require('lodash.debounce');
const useTranslate = require('stremio/common/useTranslate');
const { useStreamingServer, useNotifications, withCoreSuspender, getVisibleChildrenRange, useProfile } = require('stremio/common');
const { EventModal, MainNavBars, MetaItem, MetaRow } = require('stremio/components');
const useBoard = require('./useBoard');
const useContinueWatchingPreview = require('./useContinueWatchingPreview');
const useCasaPrefetch = require('./useCasaPrefetch');
const useCasaWatchlist = require('./useCasaWatchlist');
const ContinueWatchingRowItem = require('./ContinueWatchingRowItem');
const { mergeWatchlist } = require('stremio/common/casaWatchlist');
const BoardHero = require('./BoardHero');
const styles = require('./styles');
const { default: StreamingServerWarning } = require('./StreamingServerWarning');

const THRESHOLD = 5;

// TV: nascondi le righe "Featured" del Board — ridondanti rispetto a Popular
// e Rotten Tomatoes Certified Fresh (stessi top-tier titoli). Filtriamo per
// nome del catalog (case-insensitive, prefisso "Featured" — tipicamente
// "Featured Movies" / "Featured Series").
const isFeaturedCatalog = (catalog) => {
    const name = catalog?.name ?? '';
    return /^featured\b/i.test(name);
};

// TV: porta una card in vista nel suo rail orizzontale SENZA ri-centrarla
// sempre. Il re-center continuo (scrollTo del centro a ogni freccia) faceva
// "balzare" l'intera riga avanti/indietro: passando 1a->2a card il rail
// scrollava di ~15px per centrare, e tornando indietro ri-scrollava a 0.
// Qui: prima card -> scrollLeft 0; ultima -> fondo; in mezzo scrolla SOLO
// se la card sta entrando/uscendo da un bordo (margine RAIL_REVEAL_PAD).
// Card gia' visibile = nessuno scroll = nessun balzo.
const RAIL_REVEAL_PAD = 32;
const revealCardInRail = (rowScroll, card) => {
    if (!rowScroll || !card) return;
    if (!card.previousElementSibling) {
        rowScroll.scrollTo({ left: 0, behavior: 'smooth' });
        return;
    }
    if (!card.nextElementSibling) {
        rowScroll.scrollTo({ left: rowScroll.scrollWidth, behavior: 'smooth' });
        return;
    }
    const railRect = rowScroll.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    if (cardRect.left < railRect.left + RAIL_REVEAL_PAD) {
        rowScroll.scrollBy({ left: cardRect.left - railRect.left - RAIL_REVEAL_PAD, behavior: 'smooth' });
    } else if (cardRect.right > railRect.right - RAIL_REVEAL_PAD) {
        rowScroll.scrollBy({ left: cardRect.right - railRect.right + RAIL_REVEAL_PAD, behavior: 'smooth' });
    }
};

const Board = () => {
    const t = useTranslate();
    const streamingServer = useStreamingServer();
    const continueWatchingPreview = useContinueWatchingPreview();
    const [board, loadBoardRows] = useBoard();
    const notifications = useNotifications();
    const profile = useProfile();
    // "Watchlist" vive DENTRO Continue Watching, non in una riga sua: e' la
    // stessa domanda ("cosa guardo adesso?") e due righe separate la
    // spezzerebbero in due. Prima l'unico modo di metterci un titolo era farlo
    // partire e fermarlo subito — l'unica azione che scrive `time_offset > 0`,
    // che e' cio' che il core richiede per considerarlo "in continue watching".
    const casaWatchlist = useCasaWatchlist();
    const continueWatchingItems = React.useMemo(() => {
        return mergeWatchlist(continueWatchingPreview.items, casaWatchlist.items, casaWatchlist.activity);
    }, [continueWatchingPreview.items, casaWatchlist]);
    const continueWatchingCatalog = React.useMemo(() => {
        return { ...continueWatchingPreview, items: continueWatchingItems };
    }, [continueWatchingPreview, continueWatchingItems]);
    const boardCatalogsOffset = continueWatchingItems.length > 0 ? 1 : 0;
    const scrollContainerRef = React.useRef();
    const containerRef = React.useRef();
    // Catalog renderizzati = board.catalogs meno Featured. `originalIdx` ci
    // serve per tradurre la visibile-range (DOM children) in indici core
    // quando chiamiamo loadBoardRows (core ha la lista non filtrata).
    const visibleCatalogs = React.useMemo(() => {
        return board.catalogs.reduce((acc, catalog, originalIdx) => {
            if (!isFeaturedCatalog(catalog)) acc.push({ catalog, originalIdx });
            return acc;
        }, []);
    }, [board.catalogs]);
    // Casa: scalda in anticipo le info dell'hero per la testa di ogni riga,
    // invece di aspettare che l'utente ci passi sopra. Vedi useCasaPrefetch.js.
    useCasaPrefetch(board.catalogs, continueWatchingItems);

    const showStreamingServerWarning = React.useMemo(() => {
        return streamingServer.settings !== null && streamingServer.settings.type === 'Err' && (
            isNaN(profile.settings.streamingServerWarningDismissed.getTime()) ||
            profile.settings.streamingServerWarningDismissed.getTime() < Date.now());
    }, [profile.settings, streamingServer.settings]);
    const onVisibleRangeChange = React.useCallback(() => {
        const range = getVisibleChildrenRange(scrollContainerRef.current);
        if (range === null) {
            return;
        }

        const start = Math.max(0, range.start - boardCatalogsOffset - THRESHOLD);
        const end = range.end - boardCatalogsOffset + THRESHOLD;
        if (end < start) {
            return;
        }

        // start/end qui sono indici nella lista FILTRATA (visibleCatalogs).
        // Core lavora sulla lista originale → traduci via originalIdx.
        if (visibleCatalogs.length === 0) {
            loadBoardRows({ start, end });
            return;
        }
        const origStart = visibleCatalogs[Math.min(start, visibleCatalogs.length - 1)].originalIdx;
        const origEnd = visibleCatalogs[Math.min(end, visibleCatalogs.length - 1)].originalIdx;
        loadBoardRows({ start: origStart, end: origEnd });
    }, [boardCatalogsOffset, visibleCatalogs]);
    const onScroll = React.useCallback(debounce(onVisibleRangeChange, 250), [onVisibleRangeChange]);
    React.useLayoutEffect(() => {
        onVisibleRangeChange();
    }, [board.catalogs, onVisibleRangeChange]);

    // TV: hero meta-preview sopra le rail che mostra l'info dell'item
    // focusato. Ascoltiamo un CustomEvent emesso da MetaRow quando una
    // card prende focus (event bus decoupled).
    const [focusedMeta, setFocusedMeta] = React.useState(null);
    React.useEffect(() => {
        const root = scrollContainerRef.current;
        if (!root) return undefined;
        const handler = (e) => {
            if (e?.detail?.item) setFocusedMeta(e.detail.item);
        };
        root.addEventListener('casa-meta-focus', handler);
        return () => root.removeEventListener('casa-meta-focus', handler);
    }, []);

    // TV: memoria last-col per riga. Se passo da row A card 5 a row B e
    // torno su, voglio focus su A card 5 (non card 0). Senza memoria, il
    // rail di A restava scrollato a card 5 ma il focus tornava su card 0
    // off-screen → "non vedo niente di selezionato" finche' non premevo
    // ancora una freccia. WeakMap key=row element: se la riga remonta
    // (catalog reload async), la entry decade automaticamente.
    const lastCardByRowRef = React.useRef(new WeakMap());

    // TV: nav row-a-row su Up/Down + tile-a-tile su Left/Right. Lo scroll
    // nativo del browser per le frecce su elemento focus-ato fa passettini
    // quantizzati (~40px) invece di muovere il focus — pessimo da divano.
    const onBoardKeyDown = React.useCallback((e) => {
        const isVertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
        const isHorizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
        if (!isVertical && !isHorizontal) return;
        // Il board POSSIEDE la nav verticale: Up/Down non escono MAI verso la
        // sidebar (solo ArrowLeft lo fa). Consuma SEMPRE i verticali — prima
        // di qualunque return anticipato (root/row non trovati, bordo lista) —
        // cosi' lo spatial-navigation-polyfill (keydown bubble su window, che
        // si attiva solo se !e.defaultPrevented) non porta il focus sui tab del
        // menu. Sintomo prima del fix: ArrowUp dalla prima riga -> tab Library.
        if (isVertical) {
            e.preventDefault();
            e.stopPropagation();
        }
        const current = e.target;
        const root = scrollContainerRef.current;
        if (!root) return;
        const currentRow = current.closest('[class*="meta-row-container"]');
        if (!currentRow) return;

        if (isVertical) {
            const allRows = [...root.querySelectorAll('[class*="meta-row-container"]')];
            const idx = allRows.indexOf(currentRow);
            const target = e.key === 'ArrowDown' ? allRows[idx + 1] : allRows[idx - 1];
            if (!target) return;
            const remembered = lastCardByRowRef.current.get(target);
            const rememberedAlive = remembered && target.contains(remembered) ? remembered : null;
            const firstCardEl = target.querySelector('[class*="meta-item-container"]');
            const fallback = firstCardEl ||
                target.querySelector('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
            const focusTarget = rememberedAlive || fallback;
            if (focusTarget) focusTarget.focus({ preventScroll: true });
            // block:'start' allinea la TOP della riga (titolo) con il top
            // del scroller (meno lo scroll-margin-top). 'nearest' invece
            // non scrollava quando la riga era gia' parzialmente in view,
            // lasciando il titolo cropped sopra il viewport.
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Porta la card in vista nel rail (reveal-if-needed, no re-center).
            revealCardInRail(target.querySelector('[class*="meta-items-container"]'), focusTarget);
            return;
        }

        // Horizontal: trova la card corrente + salta alla sibling.
        const currentCard = current.closest('[class*="meta-item-container"]');
        if (!currentCard) return;
        const rowItems = [...currentRow.querySelectorAll('[class*="meta-item-container"]')];
        const cardIdx = rowItems.indexOf(currentCard);
        // ArrowLeft sulla PRIMA card di una riga → esci dalla lista e
        // focussa la sidebar (tab selezionata). Consente di navigare a
        // Search/Library/Settings/Profile con le frecce.
        if (e.key === 'ArrowLeft' && cardIdx === 0) {
            const navBar = document.querySelector('[class*="vertical-nav-bar-container"]');
            if (navBar) {
                const selectedTab = navBar.querySelector('[class*="nav-tab-button-container"].selected')
                    || navBar.querySelector('[class*="nav-tab-button-container"]');
                if (selectedTab) {
                    e.preventDefault();
                    e.stopPropagation();
                    selectedTab.focus({ preventScroll: true });
                    return;
                }
            }
        }
        const targetCard = e.key === 'ArrowRight' ? rowItems[cardIdx + 1] : rowItems[cardIdx - 1];
        if (!targetCard) return;
        e.preventDefault();
        e.stopPropagation();
        // La card stessa e' un <a href> (la Button di stremio/components
        // renderizza anchor). Focussiamo direttamente la card, non cerchiamo
        // figli focusabili (il menu 3-pallini Multiselect ha tabindex=-1
        // ma veniva matchato comunque da querySelector('[tabindex]')).
        targetCard.focus({ preventScroll: true });
        lastCardByRowRef.current.set(currentRow, targetCard);
        // Scroll SOLO orizzontale, reveal-if-needed (no re-center continuo
        // che faceva balzare la riga avanti/indietro a ogni freccia).
        revealCardInRail(currentRow.querySelector('[class*="meta-items-container"]'), targetCard);
    }, []);

    // TV: default focus sulla prima card, ma solo DOPO che l'array catalogs
    // smette di cambiare per 500ms. I cataloghi arrivano in modo async e
    // possono inserire righe nuove (es. Continue Watching) sopra la prima,
    // shiftando il layout: se focussiamo prima che tutto si sia stabilizzato
    // il focus finisce su una card che poi si sposta visivamente.
    // Key stabile su tipi+conteggio per non re-firare ad ogni render quando
    // l'identita' di board.catalogs cambia senza che il contenuto sia mosso.
    const catalogsStateKey = React.useMemo(() => {
        return (
            continueWatchingItems.length + ':' +
            board.catalogs.map((c) => c.content?.type || 'pending').join(',')
        );
    }, [board.catalogs, continueWatchingItems.length]);
    const initialFocusDoneRef = React.useRef(false);
    React.useEffect(() => {
        if (initialFocusDoneRef.current) return;
        const tid = setTimeout(() => {
            if (initialFocusDoneRef.current) return;
            const root = scrollContainerRef.current;
            if (!root) return;
            const ae = document.activeElement;
            // L'utente ha gia' scelto una card? Non sovrascrivere.
            if (ae && ae !== document.body && root.contains(ae) && ae.closest('[class*="meta-item-container"]')) {
                initialFocusDoneRef.current = true;
                return;
            }
            // Il meta-item-container (<a href>) e' gia' focusable.
            const firstCard = root.querySelector('[class*="meta-item-container"]');
            if (!firstCard) return;
            initialFocusDoneRef.current = true;
            firstCard.focus({ preventScroll: true });
            // Scrolla la ROW (titolo+cards) al top, non la card da sola.
            // firstCard.scrollIntoView allineava il TOP della card col top
            // dello scroller, ma la card sta sotto il titolo della riga
            // → titolo scrollato via dal viewport (cropped).
            const firstRow = firstCard.closest('[class*="meta-row-container"]');
            if (firstRow) firstRow.scrollIntoView({ block: 'start' });
        }, 500);
        return () => clearTimeout(tid);
    }, [catalogsStateKey]);
    // TV: rientrando in Home da un'altra route (Settings/Library/...) il
    // Board NON si rimonta — il router gli mette solo display:none su un
    // antenato (route-container) e lo ri-mostra. Quindi initialFocusDoneRef
    // resta true e la prima card NON viene ri-focussata: il focus e' sul
    // BODY/tab e la prima freccia la gestisce lo spatial-navigation-polyfill
    // con un focus() SENZA preventScroll = autoscroll verticale che spezza la
    // riga (titolo "Continue Watching" fuori vista). Fix: un Intersection
    // Observer rifocussa la prima card ogni volta che il board ridiventa
    // visibile, se il focus non e' gia' su una card della lista.
    React.useEffect(() => {
        const el = containerRef.current;
        if (!el) return undefined;
        const io = new IntersectionObserver((entries) => {
            for (const en of entries) {
                if (!en.isIntersecting) continue;
                const root = scrollContainerRef.current;
                if (!root) continue;
                const ae = document.activeElement;
                const focusInList = ae && root.contains(ae) && ae.closest('[class*="meta-item-container"]');
                if (focusInList) continue;
                const firstCard = root.querySelector('[class*="meta-item-container"]');
                if (!firstCard) continue;
                root.scrollTop = 0;
                firstCard.focus({ preventScroll: true });
            }
        }, { threshold: 0 });
        io.observe(el);
        return () => io.disconnect();
    }, []);
    // TV: prima freccia quando NIENTE e' in focus.
    //
    // `onBoardKeyDown` sta sullo scroller e riceve solo i tasti partiti da
    // dentro la lista: col focus sul BODY non viene invocato, e la freccia
    // finisce allo spatial-navigation-polyfill (keydown su window). Quello fa
    // un `focus()` NUDO, senza `preventScroll` -> il browser scrolla la card in
    // vista col minimo movimento, cioe' allineandone il bordo: il TITOLO della
    // riga finisce sopra il viewport e la prima riga si vede tagliata.
    // ⚠️ Peggiora con lo ZOOM del browser, che e' come si usa la tile dal Mac:
    // `html { font-size }` scala solo sui breakpoint di LARGHEZZA, l'altezza no
    // -> piu' zoom, meno spazio verticale, e la prima riga finisce sotto la
    // piega. Misurato: a 175% e 200% la freccia giu' da focus vuoto non faceva
    // proprio NULLA (il polyfill non raggiungeva la card, focus fermo su body).
    // Qui si fa la stessa cosa dell'auto-focus iniziale: `preventScroll` +
    // scroll della RIGA con `block:'start'`, che tiene il titolo in vista.
    React.useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' &&
                e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            // Solo "niente in focus": se il focus e' sulla sidebar o in un menu
            // e' roba loro, non gliela si ruba.
            const ae = document.activeElement;
            if (ae && ae !== document.body) return;
            // ⚠️ Le rotte restano MONTATE (il router mette display:none): senza
            // questa guardia il Board si mangerebbe le frecce di Settings.
            // `offsetParent` e' null proprio quando un antenato e' display:none.
            if (!containerRef.current || containerRef.current.offsetParent === null) return;
            const root = scrollContainerRef.current;
            const firstCard = root && root.querySelector('[class*="meta-item-container"]');
            if (!firstCard) return;
            e.preventDefault();
            e.stopPropagation();
            root.scrollTop = 0;
            firstCard.focus({ preventScroll: true });
            const row = firstCard.closest('[class*="meta-row-container"]');
            if (row) row.scrollIntoView({ block: 'start' });
        };
        // Capture: il polyfill ascolta su window in bubble e si tira indietro se
        // l'evento e' gia' `defaultPrevented`, quindi va intercettato prima.
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, []);

    return (
        <div ref={containerRef} className={styles['board-container']}>
            <EventModal />
            <MainNavBars className={styles['board-content-container']} route={'board'}>
                <div className={styles['board-vstack']}>
                    <BoardHero meta={focusedMeta} />
                    <div ref={scrollContainerRef} className={styles['board-content']} onScroll={onScroll} onKeyDown={onBoardKeyDown}>
                        {
                            continueWatchingItems.length > 0 ?
                                <MetaRow
                                    className={classnames(styles['board-row'], styles['continue-watching-row'], 'animation-fade-in')}
                                    title={t.string('BOARD_CONTINUE_WATCHING')}
                                    catalog={continueWatchingCatalog}
                                    itemComponent={ContinueWatchingRowItem}
                                    notifications={notifications}
                                />
                                :
                                null
                        }
                        {visibleCatalogs.map(({ catalog }, index) => {
                            switch (catalog.content?.type) {
                                case 'Ready': {
                                    return (
                                        <MetaRow
                                            key={index}
                                            className={classnames(styles['board-row'], styles[`board-row-${catalog.content.content[0].posterShape}`], 'animation-fade-in')}
                                            catalog={catalog}
                                            itemComponent={MetaItem}
                                        />
                                    );
                                }
                                case 'Err': {
                                    if (catalog.content.content !== 'EmptyContent') {
                                        return (
                                            <MetaRow
                                                key={index}
                                                className={classnames(styles['board-row'], 'animation-fade-in')}
                                                catalog={catalog}
                                                message={catalog.content.content}
                                            />
                                        );
                                    }
                                    return null;
                                }
                                default: {
                                    return (
                                        <MetaRow.Placeholder
                                            key={index}
                                            className={classnames(styles['board-row'], styles['board-row-poster'], 'animation-fade-in')}
                                            catalog={catalog}
                                            title={t.catalogTitle(catalog)}
                                        />
                                    );
                                }
                            }
                        })}
                    </div>
                </div>
            </MainNavBars>
            {
                showStreamingServerWarning ?
                    <StreamingServerWarning className={styles['board-warning-container']} />
                    :
                    null
            }
        </div>
    );
};

const BoardFallback = () => (
    <div className={styles['board-container']}>
        <MainNavBars className={styles['board-content-container']} route={'board'} />
    </div>
);

module.exports = withCoreSuspender(Board, BoardFallback);
