// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const { useTranslation } = require('react-i18next');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const NotFound = require('stremio/routes/NotFound');
const { useProfile, useNotifications, routesRegexp, useOnScrollToBottom, withCoreSuspender } = require('stremio/common');
const { DelayedRenderer, Chips, Image, MainNavBars, LibItem, MultiselectMenu } = require('stremio/components');
const { default: Placeholder } = require('./Placeholder');
const useLibrary = require('./useLibrary');
const useSelectableInputs = require('./useSelectableInputs');
const styles = require('./styles');

const SCROLL_TO_BOTTOM_TRESHOLD = 400;

function withModel(Library) {
    const withModel = ({ urlParams, queryParams }) => {
        const model = React.useMemo(() => {
            return typeof urlParams.path === 'string' ?
                urlParams.path.match(routesRegexp.library.regexp) ?
                    'library'
                    :
                    urlParams.path.match(routesRegexp.continuewatching.regexp) ?
                        'continue_watching'
                        :
                        null
                :
                null;
        }, [urlParams.path]);
        if (model === null) {
            return (
                <NotFound />
            );
        }

        return (
            <Library
                key={model}
                model={model}
                urlParams={urlParams}
                queryParams={queryParams}
            />
        );
    };
    withModel.displayName = 'withModel';
    return withModel;
}

const Library = ({ model, urlParams, queryParams }) => {
    const { t } = useTranslation();
    const profile = useProfile();
    const notifications = useNotifications();
    const [library, loadNextPage] = useLibrary(model, urlParams, queryParams);
    const [typeSelect, sortChips, hasNextPage] = useSelectableInputs(library);
    const scrollContainerRef = React.useRef(null);
    const onScrollToBottom = React.useCallback(() => {
        if (hasNextPage) {
            loadNextPage();
        }
    }, [hasNextPage, loadNextPage]);
    const onScroll = useOnScrollToBottom(onScrollToBottom, SCROLL_TO_BOTTOM_TRESHOLD);
    React.useLayoutEffect(() => {
        if (scrollContainerRef.current !== null && library.selected && library.selected.request.page === 1 && library.catalog.length !== 0) {
            scrollContainerRef.current.scrollTop = 0;
        }
    }, [profile.auth, library.selected]);
    React.useEffect(() => {
        if (!library.selected?.type && typeSelect.value) {
            window.location = typeSelect.value;
        }
    }, [typeSelect.value, library.selected]);

    // TV: nav 2D sulla griglia delle card. Senza handler custom governa
    // solo lo spatial-navigation-polyfill (App.js:3) che sposta focus +
    // fa scroll automatico nel mezzo dell'event: al keydown successivo
    // riparte da posizione "scrollata" → salta una card → "due in due".
    // Soluzione: prendiamo il controllo, calcoliamo il next via geometria
    // boundingClientRect (robusto a CSS grid auto-fit, niente assunzioni
    // sul numero di colonne) e preventDefault+stopPropagation per zittire
    // il polyfill.
    const onGridKeyDown = React.useCallback((e) => {
        const dir = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : e.key === 'ArrowLeft' ? 'left' : e.key === 'ArrowRight' ? 'right' : null;
        if (!dir) return;
        const container = scrollContainerRef.current;
        if (!container) return;
        const active = e.target.closest('[class*="meta-item-container"]');
        if (!active) return;
        const cards = [...container.querySelectorAll('[class*="meta-item-container"]')];
        if (cards.length <= 1) return;
        const ar = active.getBoundingClientRect();
        const acx = ar.left + ar.width / 2;
        const acy = ar.top + ar.height / 2;

        let next = null;
        if (dir === 'left' || dir === 'right') {
            // Stessa riga: centro y della candidate dentro la card attiva.
            const sign = dir === 'right' ? 1 : -1;
            const rowCands = cards.filter((c) => {
                if (c === active) return false;
                const r = c.getBoundingClientRect();
                const cy = r.top + r.height / 2;
                if (cy < ar.top || cy > ar.bottom) return false;
                const cx = r.left + r.width / 2;
                return sign > 0 ? cx > acx : cx < acx;
            });
            // Piu' vicino orizzontalmente.
            next = rowCands.sort((a, b) => {
                const ax = a.getBoundingClientRect().left + a.getBoundingClientRect().width / 2;
                const bx = b.getBoundingClientRect().left + b.getBoundingClientRect().width / 2;
                return sign * (ax - bx);
            })[0];
        } else {
            // Stessa colonna: centro x della candidate dentro la card attiva.
            const sign = dir === 'down' ? 1 : -1;
            const colCands = cards.filter((c) => {
                if (c === active) return false;
                const r = c.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                if (cx < ar.left || cx > ar.right) return false;
                const cy = r.top + r.height / 2;
                return sign > 0 ? cy > acy : cy < acy;
            });
            next = colCands.sort((a, b) => {
                const ay = a.getBoundingClientRect().top + a.getBoundingClientRect().height / 2;
                const by = b.getBoundingClientRect().top + b.getBoundingClientRect().height / 2;
                return sign * (ay - by);
            })[0];
        }

        if (!next) return;
        e.preventDefault();
        e.stopPropagation();
        next.focus({ preventScroll: true });
        next.scrollIntoView({ behavior: e.repeat ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
    }, []);

    // TV: default focus sulla prima card all'apertura, dopo che il
    // catalog ha avuto modo di stabilizzarsi. Stesso pattern Board.
    const initialFocusDoneRef = React.useRef(false);
    React.useEffect(() => {
        if (initialFocusDoneRef.current) return;
        if (!library.catalog || library.catalog.length === 0) return;
        const tid = setTimeout(() => {
            if (initialFocusDoneRef.current) return;
            const container = scrollContainerRef.current;
            if (!container) return;
            const ae = document.activeElement;
            if (ae && ae !== document.body && container.contains(ae) && ae.closest('[class*="meta-item-container"]')) {
                initialFocusDoneRef.current = true;
                return;
            }
            const first = container.querySelector('[class*="meta-item-container"]');
            if (!first) return;
            initialFocusDoneRef.current = true;
            first.focus({ preventScroll: true });
        }, 500);
        return () => clearTimeout(tid);
    }, [library.catalog?.length]);
    return (
        <MainNavBars className={styles['library-container']} route={model}>
            {
                profile.auth !== null ?
                    <div className={styles['library-content']}>
                        <div className={styles['selectable-inputs-container']}>
                            <MultiselectMenu {...typeSelect} className={styles['select-input-container']} />
                            <Chips {...sortChips} className={styles['select-input-container']} />
                        </div>
                        {
                            library.selected === null ?
                                <DelayedRenderer delay={500}>
                                    <div className={styles['message-container']}>
                                        <Image
                                            className={styles['image']}
                                            src={require('/assets/images/empty.png')}
                                            alt={' '}
                                        />
                                        <div className={styles['message-label']}>{model === 'library' ? t('LIBRARY_NOT_LOADED') : t('BOARD_CONTINUE_WATCHING_NOT_LOADED')}</div>
                                    </div>
                                </DelayedRenderer>
                                :
                                library.catalog.length === 0 ?
                                    <div className={styles['message-container']}>
                                        <Image
                                            className={styles['image']}
                                            src={require('/assets/images/empty.png')}
                                            alt={' '}
                                        />
                                        <div className={styles['message-label']}>{model === 'library' ? t('LIBRARY_EMPTY') : t('BOARD_CONTINUE_WATCHING_EMPTY')}</div>
                                    </div>
                                    :
                                    <div ref={scrollContainerRef} className={classnames(styles['meta-items-container'], 'animation-fade-in')} onScroll={onScroll} onKeyDown={onGridKeyDown}>
                                        {
                                            library.catalog.map((libItem, index) => (
                                                <LibItem {...libItem} notifications={notifications} removable={model === 'library'} key={index} />
                                            ))
                                        }
                                    </div>
                        }
                    </div>
                    :
                    <Placeholder />
            }
        </MainNavBars>
    );
};

Library.propTypes = {
    model: PropTypes.oneOf(['library', 'continue_watching']),
    urlParams: PropTypes.shape({
        type: PropTypes.string
    }),
    queryParams: PropTypes.instanceOf(URLSearchParams)
};

const LibraryFallback = ({ model }) => (
    <MainNavBars className={styles['library-container']} route={model} />
);

LibraryFallback.propTypes = Library.propTypes;

module.exports = withModel(withCoreSuspender(Library, LibraryFallback));
