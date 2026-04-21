// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const ReactIs = require('react-is');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const useTranslate = require('stremio/common/useTranslate');
const MetaRowPlaceholder = require('./MetaRowPlaceholder');
const styles = require('./styles');

// TV: mostriamo molte piu' card upfront rispetto al web classico
// (CATALOG_PREVIEW_SIZE = 10). Scrolliamo orizzontalmente.
const TV_PREVIEW_SIZE = 25;

const MetaRow = ({ className, title, catalog, message, itemComponent, notifications }) => {
    const t = useTranslate();

    const catalogTitle = React.useMemo(() => {
        return title ?? t.catalogTitle(catalog);
    }, [title, catalog, t.catalogTitle]);

    // stremio-core tronca i catalog Board a ~10 items per riga. Per il
    // nostro uso TV fetchamo extra direttamente dall'endpoint dell'addon
    // (es. cinemeta) e li aggiungiamo in coda. Costruiamo deepLinks a
    // mano perche' i raw meta non ce li hanno.
    const [extraItems, setExtraItems] = React.useState([]);
    React.useEffect(() => {
        setExtraItems([]);
        const base = catalog?.content?.content;
        if (!Array.isArray(base) || base.length === 0 || base.length >= TV_PREVIEW_SIZE) return;
        // transportUrl non e' esposto sul catalog direttamente; lo estraiamo
        // dal deepLinks.discover che ha il formato:
        //   #/discover/<url-encoded-manifest-url>/<type>/<catalogId>?...
        const discoverLink = catalog?.deepLinks?.discover;
        if (typeof discoverLink !== 'string') return;
        const match = discoverLink.match(/^#\/discover\/([^/]+)\/([^/]+)\/([^?]+)/);
        if (!match) return;
        const manifestUrl = decodeURIComponent(match[1]);
        const type = decodeURIComponent(match[2]);
        const id = decodeURIComponent(match[3]);
        const url = manifestUrl.replace(/manifest\.json$/, '') +
            'catalog/' + encodeURIComponent(type) + '/' + encodeURIComponent(id) + '.json';
        let cancelled = false;
        fetch(url)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (cancelled || !data || !Array.isArray(data.metas)) return;
                const seen = new Set(base.map((i) => i.id));
                const extra = data.metas
                    .filter((m) => m && m.id && !seen.has(m.id))
                    .slice(0, TV_PREVIEW_SIZE - base.length)
                    .map((m) => ({
                        ...m,
                        posterShape: m.posterShape || 'poster',
                        deepLinks: {
                            metaDetailsVideos: '#/metadetails/' +
                                encodeURIComponent(m.type || type) + '/' +
                                encodeURIComponent(m.id),
                        },
                    }));
                setExtraItems(extra);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [catalog]);

    const items = React.useMemo(() => {
        const base = catalog?.items ?? catalog?.content?.content ?? [];
        return extraItems.length > 0 ? [...base, ...extraItems] : base;
    }, [catalog, extraItems]);

    // Event bus: quando una card della rail prende focus, emettiamo un
    // CustomEvent 'casa-meta-focus' con l'item completo. Board ascolta a
    // livello container per aggiornare l'hero MetaPreview sopra.
    const rowRef = React.useRef(null);
    const itemsRef = React.useRef(items);
    itemsRef.current = items;
    const onRowFocus = React.useCallback((e) => {
        const btn = e.target.closest('a[href]');
        if (!btn) return;
        const href = btn.getAttribute('href') || '';
        // href pattern puo' essere:
        //   #/metadetails/{type}/{id}
        //   #/detail/{type}/{metaId}            (metaDetailsVideos)
        //   #/detail/{type}/{metaId}/{videoId}  (metaDetailsStreams)
        //   #/player/...                         (continue watching)
        const m = href.match(/#\/(?:metadetails|detail)\/[^/]+\/([^/?]+)/);
        if (!m) return;
        const id = decodeURIComponent(m[1]);
        const it = itemsRef.current.find((x) => x && x.id === id);
        if (!it || !rowRef.current) return;
        rowRef.current.dispatchEvent(new CustomEvent('casa-meta-focus', {
            bubbles: true,
            detail: { item: it },
        }));
    }, []);

    const href = React.useMemo(() => {
        return catalog?.deepLinks?.discover ?? catalog?.deepLinks?.library;
    }, [catalog]);

    return (
        <div ref={rowRef} onFocusCapture={onRowFocus} className={classnames(className, styles['meta-row-container'])}>
            <div className={styles['header-container']}>
                {
                    typeof catalogTitle === 'string' && catalogTitle.length > 0 ?
                        <div className={styles['title-container']} title={catalogTitle}>{catalogTitle}</div>
                        :
                        null
                }
                {/* TV: rimosso "See all" — apre una vista Discover che non
                    vogliamo esporre su TV (nav secondaria, troppi click). La
                    rail stessa gia' scrolla orizzontalmente per 25 card. */}
            </div>
            {
                typeof message === 'string' && message.length > 0 ?
                    <div className={styles['message-container']} title={message}>{message}</div>
                    :
                    <div className={styles['meta-items-container']}>
                        {
                            ReactIs.isValidElementType(itemComponent) ?
                                items.slice(0, TV_PREVIEW_SIZE).map((item, index) => {
                                    return React.createElement(itemComponent, {
                                        ...item,
                                        key: index,
                                        className: classnames(styles['meta-item'], styles['poster-shape-poster'], styles[`poster-shape-${item.posterShape}`]),
                                        notifications,
                                    });
                                })
                                :
                                null
                        }
                    </div>
            }
        </div>
    );
};

MetaRow.Placeholder = MetaRowPlaceholder;

MetaRow.propTypes = {
    className: PropTypes.string,
    title: PropTypes.string,
    message: PropTypes.string,
    catalog: PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        type: PropTypes.string,
        addon: PropTypes.shape({
            manifest: PropTypes.shape({
                id: PropTypes.string,
                name: PropTypes.string,
            }),
        }),
        content: PropTypes.shape({
            content: PropTypes.oneOfType([
                PropTypes.string,
                PropTypes.arrayOf(PropTypes.shape({
                    posterShape: PropTypes.string,
                })),
            ]),
        }),
        items: PropTypes.arrayOf(PropTypes.shape({
            posterShape: PropTypes.string,
        })),
        deepLinks: PropTypes.shape({
            discover: PropTypes.string,
            library: PropTypes.string,
        }),
    }),
    itemComponent: PropTypes.elementType,
    notifications: PropTypes.object,
};

module.exports = MetaRow;
