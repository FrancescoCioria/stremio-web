// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { useTranslation } = require('react-i18next');
const filterInvalidDOMProps = require('filter-invalid-dom-props').default;
const { default: Icon } = require('@stremio/stremio-icons/react');
const { useNavigateWithOrigin } = require('stremio-router');
const { default: Button } = require('stremio/components/Button');
const { default: Image } = require('stremio/components/Image');
const Multiselect = require('stremio/components/Multiselect');
const useBinaryState = require('stremio/common/useBinaryState');
const useTitleAvailability = require('stremio/common/useTitleAvailability');
const { ICON_FOR_TYPE } = require('stremio/common/CONSTANTS');
const styles = require('./styles');

// TV/Casa: azioni "distruttive" evidenziate in rosso nel menu contestuale.
const CASA_DANGER_OPTIONS = ['remove'];

// TV/Casa: menu contestuale della card, apribile da telecomando (tasto Menu =
// Ctrl+Shift+F13, stessa gesture delle tile del launcher). La "X" di dismiss
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
            case 'F13':
                // Tasto Menu di nuovo = chiudi (toggle). stopPropagation evita
                // che risalga alla card e la riapra subito.
                if (event.ctrlKey && event.shiftKey) {
                    event.preventDefault(); event.stopPropagation(); onClose();
                }
                break;
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
    return (
        <div ref={containerRef} className={styles['casa-context-menu']} onKeyDown={onKeyDown}>
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
    const hasOptions = Array.isArray(options) && options.length > 0;
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
    const cardOnKeyDown = React.useCallback((event) => {
        // Tasto Menu del telecomando / Options del gamepad = Ctrl+Shift+F13.
        if (event.key === 'F13' && event.ctrlKey && event.shiftKey && hasOptions) {
            event.preventDefault();
            event.stopPropagation();
            if (ctxMenuOpen) ctxMenuOnClose(); else openCtxMenu();
        }
    }, [hasOptions, ctxMenuOpen, openCtxMenu, ctxMenuOnClose]);
    const ctxMenuOnSelect = React.useCallback((value, event) => {
        // Azioni distruttive: la card sparisce dalla riga. Sposta il focus su una
        // card vicina PRIMA che smonti (in-row, poi riga adiacente come fallback),
        // altrimenti il focus cade sul body e le frecce del Board smettono di
        // muoversi (target=body -> nessuna riga trovata).
        const card = cardRef.current;
        if (value === 'dismiss' || value === 'remove') {
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
        menuOnSelect({ value, reactEvent: event, nativeEvent: event.nativeEvent });
    }, [menuOnSelect, closeCtxMenu, ctxMenuOnClose]);
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
        <Button ref={cardRef} title={name} href={href} {...filterInvalidDOMProps(props)} className={classnames(className, styles['meta-item-container'], styles['poster-shape-poster'], styles[`poster-shape-${posterShape}`], { 'active': menuOpen || ctxMenuOpen })} onClick={metaItemOnClick} onKeyDown={cardOnKeyDown}>
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
                            options={options}
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
