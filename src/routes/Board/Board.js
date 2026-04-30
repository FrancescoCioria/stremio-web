// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const classnames = require('classnames');
const debounce = require('lodash.debounce');
const useTranslate = require('stremio/common/useTranslate');
const { useStreamingServer, useNotifications, withCoreSuspender, getVisibleChildrenRange, useProfile } = require('stremio/common');
const { ContinueWatchingItem, EventModal, MainNavBars, MetaItem, MetaRow } = require('stremio/components');
const useBoard = require('./useBoard');
const useContinueWatchingPreview = require('./useContinueWatchingPreview');
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

const Board = () => {
    const t = useTranslate();
    const streamingServer = useStreamingServer();
    const continueWatchingPreview = useContinueWatchingPreview();
    const [board, loadBoardRows] = useBoard();
    const notifications = useNotifications();
    const profile = useProfile();
    const boardCatalogsOffset = continueWatchingPreview.items.length > 0 ? 1 : 0;
    const scrollContainerRef = React.useRef();
    // Catalog renderizzati = board.catalogs meno Featured. `originalIdx` ci
    // serve per tradurre la visibile-range (DOM children) in indici core
    // quando chiamiamo loadBoardRows (core ha la lista non filtrata).
    const visibleCatalogs = React.useMemo(() => {
        return board.catalogs.reduce((acc, catalog, originalIdx) => {
            if (!isFeaturedCatalog(catalog)) acc.push({ catalog, originalIdx });
            return acc;
        }, []);
    }, [board.catalogs]);
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
            e.preventDefault();
            e.stopPropagation();
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
            // Centra orizzontalmente la card focusata nel suo rail. Senza
            // questo, se la card ricordata e' off-screen (rail scrollato a
            // posizione vecchia) il focus resta invisibile.
            const rowScroll = target.querySelector('[class*="meta-items-container"]');
            if (rowScroll && focusTarget) {
                const cardRect = focusTarget.getBoundingClientRect();
                const rowRect = rowScroll.getBoundingClientRect();
                const delta = cardRect.left + cardRect.width / 2 - (rowRect.left + rowRect.width / 2);
                rowScroll.scrollTo({ left: rowScroll.scrollLeft + delta, behavior: 'smooth' });
            }
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
        // Scroll SOLO orizzontale nel container della riga (no scrollIntoView
        // generico che involverebbe anche il board-content e farebbe uscire
        // il titolo della riga dalla vista).
        const rowScroll = currentRow.querySelector('[class*="meta-items-container"]');
        if (rowScroll) {
            const cardRect = targetCard.getBoundingClientRect();
            const rowRect = rowScroll.getBoundingClientRect();
            const delta = cardRect.left + cardRect.width / 2 - (rowRect.left + rowRect.width / 2);
            rowScroll.scrollTo({ left: rowScroll.scrollLeft + delta, behavior: 'smooth' });
        }
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
            continueWatchingPreview.items.length + ':' +
            board.catalogs.map((c) => c.content?.type || 'pending').join(',')
        );
    }, [board.catalogs, continueWatchingPreview.items.length]);
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
    return (
        <div className={styles['board-container']}>
            <EventModal />
            <MainNavBars className={styles['board-content-container']} route={'board'}>
                <div className={styles['board-vstack']}>
                    <BoardHero meta={focusedMeta} />
                    <div ref={scrollContainerRef} className={styles['board-content']} onScroll={onScroll} onKeyDown={onBoardKeyDown}>
                    {
                        continueWatchingPreview.items.length > 0 ?
                            <MetaRow
                                className={classnames(styles['board-row'], styles['continue-watching-row'], 'animation-fade-in')}
                                title={t.string('BOARD_CONTINUE_WATCHING')}
                                catalog={continueWatchingPreview}
                                itemComponent={ContinueWatchingItem}
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
