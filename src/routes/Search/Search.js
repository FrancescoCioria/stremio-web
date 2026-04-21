// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const debounce = require('lodash.debounce');
const useTranslate = require('stremio/common/useTranslate');
const { default: Icon } = require('@stremio/stremio-icons/react');
const { withCoreSuspender, getVisibleChildrenRange } = require('stremio/common');
const { Image, MainNavBars, MetaItem, MetaRow } = require('stremio/components');
const useSearch = require('./useSearch');
const BoardHero = require('../Board/BoardHero');
const styles = require('./styles');

const THRESHOLD = 100;

const Search = ({ queryParams }) => {
    const t = useTranslate();
    const [search, loadSearchRows] = useSearch(queryParams);
    const query = React.useMemo(() => {
        return search.selected !== null ?
            search.selected.extra.reduceRight((query, [name, value]) => {
                if (name === 'search') {
                    return value;
                }

                return query;
            }, null)
            :
            null;
    }, [search.selected]);
    const scrollContainerRef = React.useRef();
    const onVisibleRangeChange = React.useCallback(() => {
        if (search.catalogs.length === 0) {
            return;
        }

        const range = getVisibleChildrenRange(scrollContainerRef.current, THRESHOLD);
        if (range === null) {
            return;
        }

        loadSearchRows(range);
    }, [search.catalogs]);
    const onScroll = React.useCallback(debounce(onVisibleRangeChange, 250), [onVisibleRangeChange]);
    React.useLayoutEffect(() => {
        onVisibleRangeChange();
    }, [search.catalogs, onVisibleRangeChange]);

    // TV: hero con meta-info del focus corrente (stesso pattern Board).
    const [focusedMeta, setFocusedMeta] = React.useState(null);
    React.useEffect(() => {
        const root = scrollContainerRef.current;
        if (!root) return undefined;
        const handler = (e) => { if (e?.detail?.item) setFocusedMeta(e.detail.item); };
        root.addEventListener('casa-meta-focus', handler);
        return () => root.removeEventListener('casa-meta-focus', handler);
    }, [query]);

    // Arrow key nav: row-a-row / tile-a-tile (stesso pattern Board).
    const onSearchKeyDown = React.useCallback((e) => {
        const isVertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
        const isHorizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
        if (!isVertical && !isHorizontal) return;
        const root = scrollContainerRef.current;
        if (!root) return;
        const currentRow = e.target.closest('[class*="meta-row-container"]');
        if (!currentRow) return;
        if (isVertical) {
            const allRows = [...root.querySelectorAll('[class*="meta-row-container"]')];
            const idx = allRows.indexOf(currentRow);
            const target = e.key === 'ArrowDown' ? allRows[idx + 1] : allRows[idx - 1];
            if (!target) return;
            e.preventDefault();
            e.stopPropagation();
            const firstCard = target.querySelector('[class*="meta-item-container"]') ||
                target.querySelector('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
            if (firstCard) firstCard.focus({ preventScroll: true });
            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }
        const currentCard = e.target.closest('[class*="meta-item-container"]');
        if (!currentCard) return;
        const rowItems = [...currentRow.querySelectorAll('[class*="meta-item-container"]')];
        const cardIdx = rowItems.indexOf(currentCard);
        const targetCard = e.key === 'ArrowRight' ? rowItems[cardIdx + 1] : rowItems[cardIdx - 1];
        if (!targetCard) return;
        e.preventDefault();
        e.stopPropagation();
        targetCard.focus({ preventScroll: true });
        const rowScroll = currentRow.querySelector('[class*="meta-items-container"]');
        if (rowScroll) {
            const cardRect = targetCard.getBoundingClientRect();
            const rowRect = rowScroll.getBoundingClientRect();
            const delta = cardRect.left + cardRect.width / 2 - (rowRect.left + rowRect.width / 2);
            rowScroll.scrollTo({ left: rowScroll.scrollLeft + delta, behavior: 'smooth' });
        }
    }, []);

    // Default focus sulla prima card risultato dopo 500ms di stabilita'.
    const catalogsStateKey = React.useMemo(() => {
        return (query || '') + ':' + search.catalogs.map((c) => c.content?.type || 'pending').join(',');
    }, [search.catalogs, query]);
    const initialFocusDoneRef = React.useRef(null);
    React.useEffect(() => {
        if (initialFocusDoneRef.current === catalogsStateKey) return;
        const tid = setTimeout(() => {
            initialFocusDoneRef.current = catalogsStateKey;
            const root = scrollContainerRef.current;
            if (!root) return;
            const ae = document.activeElement;
            if (ae && ae !== document.body && root.contains(ae) && ae.closest('[class*="meta-item-container"]')) return;
            const firstCard = root.querySelector('[class*="meta-item-container"]');
            if (firstCard) firstCard.focus({ preventScroll: true });
        }, 500);
        return () => clearTimeout(tid);
    }, [catalogsStateKey]);

    return (
        <MainNavBars className={styles['search-container']} route={'search'} query={query}>
            <div className={styles['search-vstack']}>
                {query !== null ? <BoardHero meta={focusedMeta} /> : null}
                <div ref={scrollContainerRef} className={styles['search-content']} onScroll={onScroll} onKeyDown={onSearchKeyDown}>
                {
                    query === null ?
                        <div className={classnames(styles['search-hints-wrapper'])}>
                            <div className={classnames(styles['search-hints-title-container'], 'animation-fade-in')}>
                                <div className={styles['search-hints-title']}>{t.string('SEARCH_ANYTHING')}</div>
                            </div>
                            <div className={classnames(styles['search-hints-container'], 'animation-fade-in')}>
                                <div className={styles['search-hint-container']}>
                                    <Icon className={styles['icon']} name={'trailer'} />
                                    <div className={styles['label']}>{t.string('SEARCH_CATEGORIES')}</div>
                                </div>
                                <div className={styles['search-hint-container']}>
                                    <Icon className={styles['icon']} name={'actors'} />
                                    <div className={styles['label']}>{t.string('SEARCH_PERSONS')}</div>
                                </div>
                                <div className={styles['search-hint-container']}>
                                    <Icon className={styles['icon']} name={'link'} />
                                    <div className={styles['label']}>{t.string('SEARCH_PROTOCOLS')}</div>
                                </div>
                                <div className={styles['search-hint-container']}>
                                    <Icon className={styles['icon']} name={'imdb-outline'} />
                                    <div className={styles['label']}>{t.string('SEARCH_TYPES')}</div>
                                </div>
                            </div>
                        </div>
                        :
                        search.catalogs.length === 0 ?
                            <div className={styles['message-container']}>
                                <Image
                                    className={styles['image']}
                                    src={require('/assets/images/empty.png')}
                                    alt={' '}
                                />
                                <div className={styles['message-label']}>{ t.string('STREMIO_TV_SEARCH_NO_ADDONS') }</div>
                            </div>
                            :
                            search.catalogs.map((catalog, index) => {
                                switch (catalog.content?.type) {
                                    case 'Ready': {
                                        return (
                                            <MetaRow
                                                key={index}
                                                className={classnames(styles['search-row'], styles[`search-row-${catalog.content.content[0].posterShape}`], 'animation-fade-in')}
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
                                                    className={classnames(styles['search-row'], 'animation-fade-in')}
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
                                                className={classnames(styles['search-row'], styles['search-row-poster'], 'animation-fade-in')}
                                                catalog={catalog}
                                                title={t.catalogTitle(catalog)}
                                            />
                                        );
                                    }
                                }
                            })
                }
                </div>
            </div>
        </MainNavBars>
    );
};

Search.propTypes = {
    queryParams: PropTypes.instanceOf(URLSearchParams)
};

const SearchFallback = ({ queryParams }) => (
    <MainNavBars className={styles['search-container']} route={'search'} query={queryParams.get('search') ?? queryParams.get('query')} />
);

SearchFallback.propTypes = Search.propTypes;

module.exports = withCoreSuspender(Search, SearchFallback);
