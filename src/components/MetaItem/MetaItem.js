// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { useTranslation } = require('react-i18next');
const filterInvalidDOMProps = require('filter-invalid-dom-props').default;
const { default: Icon } = require('@stremio/stremio-icons/react');
const { useNavigateWithOrigin } = require('stremio-router');
const { useCore } = require('stremio/core');
const { CASA_WATCHLIST, addToWatchlist, removeFromWatchlist } = require('stremio/common/casaWatchlist');
const { default: Button } = require('stremio/components/Button');
const { default: Image } = require('stremio/components/Image');
const Multiselect = require('stremio/components/Multiselect');
const useBinaryState = require('stremio/common/useBinaryState');
const useTitleAvailability = require('stremio/common/useTitleAvailability');
const { ICON_FOR_TYPE } = require('stremio/common/CONSTANTS');
const styles = require('./styles');

// TV/Casa: azioni "distruttive" evidenziate in rosso nel menu contestuale.
const CASA_DANGER_OPTIONS = ['remove', 'casa-watchlist-remove'];

// TV/Casa: menu contestuale della card. UNA sola strada di apertura, l'evento
// `contextmenu`: tasto destro del mouse, oppure tasto Menu del telecomando che
// `common/casaRemoteInput.js` traduce nello stesso evento. La "X" di dismiss
// non e' focusabile col telecomando; questo menu da' un modo raggiungibile per
// eliminare/gestire un item (dismiss, watched, remove, ...). Nav propria a
// frecce con preventDefault+stopPropagation cosi' ne' lo spatial-navigation
// -polyfill (window, gate su !defaultPrevented) ne' la nav del Board
// (onKeyDown sullo scroller, bubble) interferiscono mentre e' aperto.
const CasaContextMenu = ({ options, onSelect, onClose }) => {
    const containerRef = React.useRef(null);
    const optionEls = React.useCallback(() => (
        containerRef.current ? [...containerRef.current.querySelectorAll('[role="menuitem"]')] : []
    ), []);
    React.useEffect(() => {
        const first = optionEls()[0];
        if (first) first.focus({ preventScroll: true });
    }, [optionEls]);
    React.useEffect(() => {
        const onPointerDown = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                onClose();
            }
        };
        window.addEventListener('pointerdown', onPointerDown, true);
        return () => window.removeEventListener('pointerdown', onPointerDown, true);
    }, [onClose]);
    const focusByOffset = React.useCallback((delta) => {
        const items = optionEls();
        if (items.length === 0) return;
        const current = items.indexOf(document.activeElement);
        const next = current === -1 ? 0 : (current + delta + items.length) % items.length;
        items[next].focus({ preventScroll: true });
    }, [optionEls]);
    const onKeyDown = React.useCallback((event) => {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault(); event.stopPropagation(); focusByOffset(1); break;
            case 'ArrowUp':
                event.preventDefault(); event.stopPropagation(); focusByOffset(-1); break;
            case 'ArrowLeft':
            case 'ArrowRight':
                // Inghiotti gli orizzontali: senza questo il Board sposterebbe
                // la card sotto al menu aperto.
                event.preventDefault(); event.stopPropagation(); break;
            case 'Enter':
            case ' ': {
                event.preventDefault(); event.stopPropagation();
                const idx = optionEls().indexOf(document.activeElement);
                const option = idx >= 0 ? options[idx] : null;
                if (option) onSelect(option.value, event);
                break;
            }
            case 'Escape':
                event.preventDefault(); event.stopPropagation(); onClose(); break;
            default:
                break;
        }
    }, [options, onSelect, onClose, optionEls]);
    const optionOnClick = React.useCallback((event) => {
        // Le option vivono dentro l'<a> della card: blocca la navigazione
        // dell'anchor e il metaItemOnClick.
        event.preventDefault();
        event.stopPropagation();
        event.nativeEvent.selectPrevented = true;
        onSelect(event.currentTarget.dataset.value, event);
    }, [onSelect]);
    const optionOnMouseDown = React.useCallback((event) => {
        // Evita il blur() che Button fa sul mousedown (ci toglierebbe il focus).
        event.stopPropagation();
        event.nativeEvent.buttonBlurPrevented = true;
    }, []);
    // Secondo "menu" (tasto del telecomando o destro) a menu aperto = chiudi.
    // stopPropagation evita che risalga alla card e lo riapra subito.
    const onContextMenu = React.useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
    }, [onClose]);
    return (
        <div ref={containerRef} className={styles['casa-context-menu']} onKeyDown={onKeyDown} onContextMenu={onContextMenu}>
            {options.map((option) => (
                <div
                    key={option.value}
                    role={'menuitem'}
                    tabIndex={-1}
                    data-value={option.value}
                    title={option.label}
                    className={classnames(styles['casa-context-option'], { [styles['casa-context-option-danger']]: CASA_DANGER_OPTIONS.includes(option.value) })}
                    onClick={optionOnClick}
                    onMouseDown={optionOnMouseDown}
                >
                    {option.label}
                </div>
            ))}
        </div>
    );
};

CasaContextMenu.propTypes = {
    options: PropTypes.arrayOf(PropTypes.shape({
        value: PropTypes.string,
        label: PropTypes.string
    })),
    onSelect: PropTypes.func,
    onClose: PropTypes.func
};

const MetaItem = React.memo(({ className, type, id, name, poster, posterShape, posterChangeCursor, progress, newVideos, options, deepLinks, dataset, optionOnSelect, onDismissClick, onPlayClick, watched, ...props }) => {
    const { t } = useTranslation();
    const { navigateWithOrigin } = useNavigateWithOrigin();
    const [menuOpen, onMenuOpen, onMenuClose] = useBinaryState(false);
    const cardRef = React.useRef(null);
    const [ctxMenuOpen, openCtxMenu, closeCtxMenu] = useBinaryState(false);
    const core = useCore();
    const inWatchlist = props[CASA_WATCHLIST] === true;
    // Opzioni del MENU CONTESTUALE. Diverse da `options`:
    //
    // `options` lo costruisce LibItem e ce l'hanno solo le card della library
    // (Continue Watching + pagina Library): play/details/dismiss/watched/remove.
    // Le card dei cataloghi — cioe' la stragrande maggioranza della home — non
    // ne avevano NESSUNA, quindi il menu non si apriva proprio.
    //
    // ⚠️ Restano due variabili distinte di proposito: il Multiselect (i tre
    // pallini nella barra del titolo) continua a leggere `options`, cosi' non
    // spunta un pulsante nuovo su ogni card della home. Il menu contestuale
    // (tasto Menu del telecomando / click destro) legge queste.
    const ctxOptions = React.useMemo(() => {
        if (Array.isArray(options) && options.length > 0) return options;
        if (typeof id !== 'string' || typeof type !== 'string') return [];
        return [
            inWatchlist ?
                { label: 'Togli da Watchlist', value: 'casa-watchlist-remove' }
                :
                { label: 'Watchlist', value: 'casa-watchlist-add' },
            { label: 'Segna come visto', value: 'casa-mark-watched' },
        ];
    }, [options, inWatchlist, id, type]);
    const hasOptions = Array.isArray(ctxOptions) && ctxOptions.length > 0;
    // Azioni Casa. Ritorna true se ha gestito il valore, cosi' il chiamante sa
    // di non doverlo passare a `optionOnSelect` (che sulle card di catalogo non
    // esiste nemmeno).
    const casaOnSelect = React.useCallback((value) => {
        // Payload minimo di MetaItemPreview: il core richiede solo id/type/name
        // (tutto il resto e' Option/Vec con default, via MetaItemPreviewLegacy).
        // Volutamente NON si rigira l'intero oggetto props: dentro ci sono
        // className/notifications/key, roba che non c'entra col core.
        const metaItemPreview = {
            id,
            type,
            name: typeof name === 'string' ? name : '',
            poster: typeof poster === 'string' ? poster : null,
            posterShape: typeof posterShape === 'string' ? posterShape : null,
        };
        switch (value) {
            case 'casa-watchlist-add':
                void addToWatchlist(metaItemPreview);
                return true;
            case 'casa-watchlist-remove':
                void removeFromWatchlist(id);
                return true;
            case 'casa-mark-watched':
                core.transport.dispatch({
                    action: 'Ctx',
                    args: {
                        action: 'MetaItemMarkAsWatched',
                        args: { meta_item: metaItemPreview, is_watched: true }
                    }
                });
                // Un titolo appena segnato visto non ha nulla da fare in
                // "Watchlist". La riconciliazione del backend ci arriverebbe
                // da sola, ma solo al prossimo giro (library in cache 1h): qui
                // il gesto e' esplicito, quindi l'effetto dev'essere immediato.
                if (inWatchlist) void removeFromWatchlist(id);
                return true;
            default:
                return false;
        }
    }, [core, id, type, name, poster, posterShape, inWatchlist]);
    const href = React.useMemo(() => {
        return deepLinks ?
            typeof deepLinks.metaDetailsStreams === 'string' ?
                deepLinks.metaDetailsStreams
                :
                typeof deepLinks.metaDetailsVideos === 'string' ?
                    deepLinks.metaDetailsVideos
                    :
                    typeof deepLinks.player === 'string' ?
                        deepLinks.player
                        :
                        null
            :
            null;
    }, [deepLinks]);
    const metaItemOnClick = React.useCallback((event) => {
        if (event.nativeEvent.selectPrevented) {
            event.preventDefault();
            return;
        }
        // TV fork: props.onClick (es. LibItem.onTileClick: direct-play +
        // seeding history episodi/streams) ha la PRECEDENZA su href. Se gestisce
        // la navigazione fa preventDefault e ci fermiamo; altrimenti fallback al
        // navigateWithOrigin di upstream (MetaItem normali di Board/Search).
        if (typeof props.onClick === 'function') {
            props.onClick(event);
            if (event.defaultPrevented) {
                return;
            }
        }
        if (typeof href === 'string') {
            event.preventDefault();
            navigateWithOrigin(href);
        }
    }, [href, navigateWithOrigin, props.onClick]);
    const menuOnClick = React.useCallback((event) => {
        event.nativeEvent.selectPrevented = true;
    }, []);
    const menuOnSelect = React.useCallback((event) => {
        if (typeof optionOnSelect === 'function') {
            optionOnSelect({
                type: 'select-option',
                value: event.value,
                dataset: dataset,
                reactEvent: event.reactEvent,
                nativeEvent: event.nativeEvent
            });
        }
    }, [dataset, optionOnSelect]);
    const ctxMenuOnClose = React.useCallback(() => {
        closeCtxMenu();
        // Riporta il focus sulla card: se restasse sul menu smontato cadrebbe sul
        // body e la nav a frecce del Board si bloccherebbe.
        if (cardRef.current) cardRef.current.focus({ preventScroll: true });
    }, [closeCtxMenu]);
    const cardOnContextMenu = React.useCallback((event) => {
        // UNICA strada del menu contestuale: tasto destro del mouse E tasto Menu
        // del telecomando/gamepad, che `casaRemoteInput.js` traduce in un
        // `contextmenu` sintetico sull'elemento a fuoco. Cosi' cio' che si prova
        // col mouse sul Mac e' letteralmente lo stesso codice che gira in salotto.
        if (!hasOptions) return;
        event.preventDefault();
        event.stopPropagation();
        openCtxMenu();
    }, [hasOptions, openCtxMenu]);
    const ctxMenuOnSelect = React.useCallback((value, event) => {
        // Azioni distruttive: la card sparisce dalla riga. Sposta il focus su una
        // card vicina PRIMA che smonti (in-row, poi riga adiacente come fallback),
        // altrimenti il focus cade sul body e le frecce del Board smettono di
        // muoversi (target=body -> nessuna riga trovata).
        const card = cardRef.current;
        if (value === 'dismiss' || value === 'remove' || value === 'casa-watchlist-remove') {
            const row = card && card.closest('[class*="meta-row-container"]');
            const cards = row ? [...row.querySelectorAll('[class*="meta-item-container"]')] : [];
            const idx = cards.indexOf(card);
            let neighbor = idx >= 0 ? (cards[idx + 1] || cards[idx - 1]) : null;
            if (!neighbor && card) {
                const scroller = card.closest('[class*="board-content"]');
                const rows = scroller ? [...scroller.querySelectorAll('[class*="meta-row-container"]')] : [];
                const rowIdx = row ? rows.indexOf(row) : -1;
                const adjacentRow = rowIdx >= 0 ? (rows[rowIdx + 1] || rows[rowIdx - 1]) : null;
                neighbor = adjacentRow ? adjacentRow.querySelector('[class*="meta-item-container"]') : null;
            }
            if (neighbor) neighbor.focus({ preventScroll: true });
            closeCtxMenu();
        } else {
            ctxMenuOnClose();
        }
        // Le azioni Casa non passano da `optionOnSelect`: le card di catalogo
        // non ne hanno uno, e su quelle della library significherebbe un'altra cosa.
        if (!casaOnSelect(value)) {
            menuOnSelect({ value, reactEvent: event, nativeEvent: event.nativeEvent });
        }
    }, [menuOnSelect, closeCtxMenu, ctxMenuOnClose, casaOnSelect]);
    const { inCinema, onPrime } = useTitleAvailability(type, id);
    const renderPosterFallback = React.useCallback(() => (
        <Icon
            className={styles['placeholder-icon']}
            name={ICON_FOR_TYPE.has(type) ? ICON_FOR_TYPE.get(type) : ICON_FOR_TYPE.get('other')}
        />
    ), [type]);
    const renderMenuLabelContent = React.useCallback(() => (
        <Icon className={styles['icon']} name={'more-vertical'} />
    ), []);
    return (
        <Button ref={cardRef} title={name} href={href} {...filterInvalidDOMProps(props)} className={classnames(className, styles['meta-item-container'], styles['poster-shape-poster'], styles[`poster-shape-${posterShape}`], { 'active': menuOpen || ctxMenuOpen })} onClick={metaItemOnClick} onContextMenu={cardOnContextMenu}>
            <div className={classnames(styles['poster-container'], { 'poster-change-cursor': posterChangeCursor })}>
                {
                    onDismissClick ?
                        <div title={t('LIBRARY_RESUME_DISMISS')} className={styles['dismiss-icon-layer']} onClick={onDismissClick}>
                            <Icon className={styles['dismiss-icon']} name={'close'} />
                            <div className={styles['dismiss-icon-backdrop']} />
                        </div>
                        :
                        null
                }
                {
                    watched ?
                        <div className={styles['watched-icon-layer']}>
                            <Icon className={styles['watched-icon']} name={'checkmark'} />
                        </div>
                        :
                        null
                }
                <div className={styles['poster-image-layer']}>
                    <Image
                        className={styles['poster-image']}
                        src={poster}
                        alt={' '}
                        renderFallback={renderPosterFallback}
                    />
                </div>
                {
                    onPlayClick ?
                        <div title={t('CONTINUE_WATCHING')} className={styles['play-icon-layer']} onClick={onPlayClick}>
                            <Icon className={styles['play-icon']} name={'play'} />
                            <div className={styles['play-icon-outer']} />
                            <div className={styles['play-icon-background']} />
                        </div>
                        :
                        null
                }
                {
                    progress > 0 ?
                        <div className={styles['progress-bar-layer']}>
                            <div className={styles['progress-bar']} style={{ width: `${progress}%` }} />
                            <div className={styles['progress-bar-background']} />
                        </div>
                        :
                        null
                }
                {
                    newVideos > 0 ?
                        <div className={styles['new-videos']}>
                            <div className={styles['layer']} />
                            <div className={styles['layer']} />
                            <div className={styles['layer']}>
                                <Icon className={styles['icon']} name={'add'} />
                                <div className={styles['label']}>
                                    {newVideos}
                                </div>
                            </div>
                        </div>
                        :
                        null
                }
                {
                    inCinema ?
                        <div className={styles['in-cinema-pill']}>Al Cinema</div>
                        :
                        onPrime ?
                            <div className={styles['prime-pill']}>Prime</div>
                            :
                            null
                }
                {
                    ctxMenuOpen && hasOptions ?
                        <CasaContextMenu
                            options={ctxOptions}
                            onSelect={ctxMenuOnSelect}
                            onClose={ctxMenuOnClose}
                        />
                        :
                        null
                }
            </div>
            {
                (typeof name === 'string' && name.length > 0) || (Array.isArray(options) && options.length > 0) ?
                    <div className={styles['title-bar-container']}>
                        <div className={styles['title-label']}>
                            {typeof name === 'string' && name.length > 0 ? name : ''}
                        </div>
                        {
                            Array.isArray(options) && options.length > 0 ?
                                <Multiselect
                                    className={styles['menu-label-container']}
                                    renderLabelContent={renderMenuLabelContent}
                                    options={options}
                                    onOpen={onMenuOpen}
                                    onClose={onMenuClose}
                                    onSelect={menuOnSelect}
                                    tabIndex={-1}
                                    onClick={menuOnClick}
                                />
                                :
                                null
                        }
                    </div>
                    :
                    null
            }
        </Button>
    );
});

MetaItem.displayName = 'MetaItem';

MetaItem.propTypes = {
    className: PropTypes.string,
    type: PropTypes.string,
    id: PropTypes.string,
    name: PropTypes.string,
    poster: PropTypes.string,
    posterShape: PropTypes.oneOf(['poster', 'landscape', 'square']),
    posterChangeCursor: PropTypes.bool,
    progress: PropTypes.number,
    newVideos: PropTypes.number,
    options: PropTypes.array,
    deepLinks: PropTypes.shape({
        metaDetailsVideos: PropTypes.string,
        metaDetailsStreams: PropTypes.string,
        player: PropTypes.string
    }),
    dataset: PropTypes.object,
    optionOnSelect: PropTypes.func,
    onDismissClick: PropTypes.func,
    onPlayClick: PropTypes.func,
    onClick: PropTypes.func,
    watched: PropTypes.bool
};

module.exports = MetaItem;
