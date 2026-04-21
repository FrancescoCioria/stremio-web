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

const Board = () => {
    const t = useTranslate();
    const streamingServer = useStreamingServer();
    const continueWatchingPreview = useContinueWatchingPreview();
    const [board, loadBoardRows] = useBoard();
    const notifications = useNotifications();
    const profile = useProfile();
    const boardCatalogsOffset = continueWatchingPreview.items.length > 0 ? 1 : 0;
    const scrollContainerRef = React.useRef();
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

        loadBoardRows({ start, end });
    }, [boardCatalogsOffset]);
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
            const firstCard = target.querySelector('[tabindex], a, button');
            if (firstCard) firstCard.focus({ preventScroll: true });
            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        // Horizontal: trova la card corrente + salta alla sibling.
        const currentCard = current.closest('[class*="meta-item-container"]');
        if (!currentCard) return;
        const rowItems = [...currentRow.querySelectorAll('[class*="meta-item-container"]')];
        const cardIdx = rowItems.indexOf(currentCard);
        const targetCard = e.key === 'ArrowRight' ? rowItems[cardIdx + 1] : rowItems[cardIdx - 1];
        if (!targetCard) return;
        e.preventDefault();
        e.stopPropagation();
        const focusable = targetCard.querySelector('[tabindex], a, button') || targetCard;
        focusable.focus({ preventScroll: true });
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
            const firstCard = root.querySelector('[class*="meta-item-container"] [tabindex], [class*="meta-item-container"] a, [class*="meta-item-container"] button, [class*="meta-item-container"][tabindex]');
            if (!firstCard) return;
            initialFocusDoneRef.current = true;
            firstCard.focus({ preventScroll: true });
            firstCard.scrollIntoView({ behavior: 'instant', block: 'start' });
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
                    {board.catalogs.map((catalog, index) => {
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
