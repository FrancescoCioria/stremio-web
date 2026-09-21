// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const { useTranslation } = require('react-i18next');
const { useNavigate } = require('react-router');
const { default: toPath } = require('stremio-router/toPath');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { default: useRouteFocused } = require('stremio/common/useRouteFocused');
const { default: Icon } = require('@stremio/stremio-icons/react');
const { Button, Image, Popup } = require('stremio/components');
const useBinaryState = require('stremio/common/useBinaryState');
const useProfile = require('stremio/common/useProfile');
const VideoPlaceholder = require('./VideoPlaceholder');
const { episodeState, episodeMeta, upcomingAirLabel, paddedEpisode } = require('stremio/common/casaEpisodeCard');
const styles = require('./styles');
const seriesStyles = require('./seriesCard.less');

// Casa: `variant="casa-series"` = la card della pagina SERIE (handoff Claude
// Design, 2026-09-21), con `runtime` = minuti reali dell'episodio o null.
// Variante e non componente nuovo apposta: il menu contestuale qui sotto
// (tasto Menu del telecomando, focus che torna alla card, FocusLock) ha le
// sue cicatrici, e una copia divergerebbe. Senza variante (player, menu
// episodi) la card resta quella di sempre.
const Video = ({ className, id, title, thumbnail, season, episode, released, upcoming, watched, progress, scheduled, seasonWatched, selected, deepLinks, onSelect, onMarkVideoAsWatched, onMarkSeasonAsWatched, variant, runtime, ...props }) => {
    const routeFocused = useRouteFocused();
    const profile = useProfile();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [menuOpen, openMenu, closeMenu] = useBinaryState(false);

    // Casa: il menu contestuale si apre su UNA sola strada, l'evento
    // `contextmenu` — tasto destro del mouse, oppure tasto Menu del telecomando
    // che `common/casaRemoteInput.js` traduce nello stesso evento. Upstream lo
    // apriva sul `mouseup` col tasto destro e usava `contextmenu` solo per
    // zittire il menu del browser: dal telecomando arriva SOLO il
    // `contextmenu`, quindi le card episodio non avevano nessun menu in
    // salotto mentre dal Mac funzionava (X Factor, 2026-09-11). Stesso
    // schema di `CasaContextMenu` in MetaItem.js: focus sulla prima voce
    // all'apertura, frecce su/giu' dentro il menu, orizzontali inghiottite
    // (se no la rail sposta la card sotto al menu), Escape/Menu chiudono e
    // riportano il focus sulla card — senza risalire al router, dove Escape
    // e' "indietro".
    const menuContentRef = React.useRef(null);
    const returnFocusRef = React.useRef(null);
    const closeMenuAndRefocus = React.useCallback(() => {
        closeMenu();
        const el = returnFocusRef.current;
        returnFocusRef.current = null;
        if (!el || typeof el.focus !== 'function') return;
        // ⚠️ Dopo lo smontaggio del FocusLock, non prima: finche' il lock e'
        // vivo un focus fuori dal menu lo intercetta e lo butta sul body.
        setTimeout(() => {
            if (document.contains(el)) el.focus({ preventScroll: true });
        }, 0);
    }, [closeMenu]);
    const popupLabelOnContextMenu = React.useCallback((event) => {
        if (event.nativeEvent.togglePopupPrevented) return;
        event.preventDefault();
        if (menuOpen) {
            closeMenuAndRefocus();
            return;
        }
        returnFocusRef.current = event.currentTarget;
        openMenu();
    }, [menuOpen, openMenu, closeMenuAndRefocus]);
    const popupLabelOnLongPress = React.useCallback((event) => {
        if (event.nativeEvent.pointerType !== 'mouse' && !event.nativeEvent.togglePopupPrevented && !menuOpen) {
            openMenu();
        }
    }, [menuOpen, openMenu]);
    React.useEffect(() => {
        if (!menuOpen) return;
        // ⚠️ Non nello stesso tick del commit: Popup posiziona il menu in un
        // layout effect (setState -> secondo render) e finche' non ha una
        // direzione la voce non e' focusabile — il focus falliva in silenzio
        // e cadeva sul body (misurato con Playwright).
        const tid = setTimeout(() => {
            const first = menuContentRef.current ? menuContentRef.current.querySelector('[tabindex]') : null;
            if (first) first.focus({ preventScroll: true });
        }, 0);
        return () => clearTimeout(tid);
    }, [menuOpen]);
    const popupMenuOnPointerDown = React.useCallback((event) => {
        event.nativeEvent.togglePopupPrevented = true;
    }, []);
    // Secondo "menu" (telecomando o tasto destro) a menu aperto = chiudi.
    const popupMenuOnContextMenu = React.useCallback((event) => {
        event.nativeEvent.togglePopupPrevented = true;
        event.preventDefault();
        event.stopPropagation();
        closeMenuAndRefocus();
    }, [closeMenuAndRefocus]);
    const popupMenuOnClick = React.useCallback((event) => {
        event.nativeEvent.togglePopupPrevented = true;
    }, []);
    const popupMenuOnKeyDown = React.useCallback((event) => {
        // Enter sulla voce: il click lo fa gia' il Button della voce (target);
        // qui si impedisce che risalga anche alla card.
        event.nativeEvent.buttonClickPrevented = true;
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowUp': {
                event.preventDefault();
                event.stopPropagation();
                const items = menuContentRef.current ? [...menuContentRef.current.querySelectorAll('[tabindex]')] : [];
                if (items.length === 0) return;
                const idx = items.indexOf(document.activeElement);
                const delta = event.key === 'ArrowDown' ? 1 : -1;
                items[idx === -1 ? 0 : (idx + delta + items.length) % items.length].focus({ preventScroll: true });
                return;
            }
            case 'ArrowLeft':
            case 'ArrowRight':
                event.preventDefault();
                event.stopPropagation();
                return;
            case 'Escape':
                event.preventDefault();
                event.stopPropagation();
                closeMenuAndRefocus();
                return;
            default:
                return;
        }
    }, [closeMenuAndRefocus]);
    const toggleWatchedOnClick = React.useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();
        closeMenuAndRefocus();
        onMarkVideoAsWatched({ id, released }, watched);
    }, [id, released, watched, closeMenuAndRefocus]);
    const toggleWatchedSeasonOnClick = React.useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();
        closeMenuAndRefocus();
        onMarkSeasonAsWatched(season, seasonWatched);
    }, [season, seasonWatched, onMarkSeasonAsWatched, closeMenuAndRefocus]);
    const videoButtonOnClick = React.useCallback(() => {
        if (typeof onSelect === 'function') {
            onSelect();
        }

        if (deepLinks) {
            if (typeof deepLinks.player === 'string') {
                navigate(toPath(deepLinks.player));
            } else if (typeof deepLinks.metaDetailsStreams === 'string') {
                // TV fork: PUSH (non replace). Upstream rimpiazza la pagina
                // episodi con gli stream su desktop -> il back saltava gli
                // episodi e tornava alla home. Su TV vogliamo la catena
                // stream -> episodi -> home, quindi impiliamo l'entry.
                navigate(toPath(deepLinks.metaDetailsStreams));
            }
        }
    }, [deepLinks, onSelect]);
    const renderLabel = React.useMemo(() => function renderLabel({ className, id, title, thumbnail, episode, released, upcoming, watched, progress, scheduled, children, ref, ...props }) {
        const blurThumbnail = profile.settings.hideSpoilers && season && episode && !watched;

        React.useEffect(() => {
            // ⚠️ Non sulla pagina serie: li' lo scroll lo governa VideosList
            // (auto-focus + revealRow + revealCardInRail). Questo scroll
            // smooth partiva al mount sull'ultimo episodio aperto e correva
            // contro l'auto-focus — invisibile nei test headless (da ospite
            // `selected` non e' mai vero), sulla TV loggata si'.
            if (variant === 'casa-series') return;
            if (selected && ref.current) {
                if ((progress && watched) || !watched) {
                    ref.current.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                        inline: 'start'
                    });
                }
            }
        }, [selected]);

        if (variant === 'casa-series') {
            const video = { watched, progress, released, upcoming };
            const state = episodeState(video);
            const airLabel = state === 'upcoming' ? upcomingAirLabel(released) : null;
            const hasThumb = typeof thumbnail === 'string' && thumbnail.length > 0;
            return (
                <Button {...props} ref={ref} className={classnames(className, seriesStyles['series-card'], seriesStyles[`state-${state}`])} title={title}>
                    <div className={seriesStyles['thumb']}>
                        {
                            state === 'upcoming' ?
                                <div className={seriesStyles['upcoming']}>
                                    <div className={seriesStyles['upcoming-number']}>{paddedEpisode(episode)}</div>
                                    {airLabel !== null ? <div className={seriesStyles['upcoming-date']}>{airLabel}</div> : null}
                                </div>
                                :
                                <React.Fragment>
                                    {
                                        hasThumb ?
                                            <Image
                                                className={classnames(seriesStyles['image'], { [seriesStyles['blurred']]: blurThumbnail })}
                                                src={thumbnail}
                                                alt={' '}
                                                renderFallback={() => null}
                                            />
                                            :
                                            null
                                    }
                                    {
                                        state === 'watched' ?
                                            <div className={seriesStyles['badge']}>
                                                <Icon className={seriesStyles['badge-icon']} name={'checkmark'} />
                                                VISTO
                                            </div>
                                            :
                                            state === 'inProgress' ?
                                                <div className={classnames(seriesStyles['badge'], seriesStyles['current'])}>IN CORSO</div>
                                                :
                                                null
                                    }
                                    {
                                        state === 'inProgress' ?
                                            <div className={seriesStyles['resume']}>
                                                <div className={seriesStyles['resume-fill']} style={{ width: `${Math.min(100, progress)}%` }} />
                                            </div>
                                            :
                                            null
                                    }
                                </React.Fragment>
                        }
                    </div>
                    <div className={seriesStyles['title']}>
                        {episode !== null && !isNaN(episode) ? `${episode}. ` : null}
                        {typeof title === 'string' && title.length > 0 ? title : id}
                    </div>
                    <div className={seriesStyles['meta']}>{episodeMeta(video, runtime)}</div>
                    {children}
                </Button>
            );
        }

        return (
            <Button {...props} ref={ref} className={classnames(className, styles['video-container'], { [styles['selected']]: selected })} title={title}>
                {
                    typeof thumbnail === 'string' && thumbnail.length > 0 ?
                        <div className={styles['thumbnail-container']}>
                            <Image
                                className={classnames(styles['thumbnail'], { [styles['blurred']]: blurThumbnail })}
                                src={thumbnail}
                                alt={' '}
                                renderFallback={() => (
                                    <Icon
                                        className={styles['placeholder-icon']}
                                        name={'symbol'}
                                    />
                                )}
                            />
                            {
                                progress !== null && !isNaN(progress) && progress > 0 ?
                                    <div className={styles['progress-bar-container']}>
                                        <div className={styles['progress-bar']} style={{ width: `${progress}%` }} />
                                        <div className={styles['progress-bar-background']} />
                                    </div>
                                    :
                                    null
                            }
                        </div>
                        :
                        null
                }
                <div className={styles['info-container']}>
                    <div className={styles['title-container']}>
                        {episode !== null && !isNaN(episode) ? `${episode}. ` : null}
                        {typeof title === 'string' && title.length > 0 ? title : id}
                    </div>
                    <div className={styles['flex-row-container']}>
                        {
                            released instanceof Date && !isNaN(released.getTime()) ?
                                <div className={styles['released-container']}>
                                    {released.toLocaleString(profile.settings.interfaceLanguage, { year: 'numeric', month: 'short', day: 'numeric' })}
                                </div>
                                :
                                scheduled ?
                                    <div className={styles['released-container']} title={t('TBA')}>
                                        {t('TBA')}
                                    </div>
                                    :
                                    null
                        }
                        <div className={styles['upcoming-watched-container']}>
                            {
                                upcoming && !watched ?
                                    <div className={styles['upcoming-container']}>
                                        <div className={styles['flag-label']}>{t('UPCOMING')}</div>
                                    </div>
                                    :
                                    null
                            }
                            {
                                watched ?
                                    <div className={styles['watched-container']}>
                                        <Icon className={styles['flag-icon']} name={'eye'} />
                                        <div className={styles['flag-label']}>{t('CTX_WATCHED')}</div>
                                    </div>
                                    :
                                    null
                            }
                        </div>
                    </div>
                </div>
                {children}
            </Button>
        );
    }, [selected, variant, runtime, profile.settings.hideSpoilers]);
    const renderMenu = React.useMemo(() => function renderMenu() {
        return (
            <div ref={menuContentRef} className={styles['context-menu-content']} onPointerDown={popupMenuOnPointerDown} onContextMenu={popupMenuOnContextMenu} onClick={popupMenuOnClick} onKeyDown={popupMenuOnKeyDown}>
                <Button className={styles['context-menu-option-container']} title={t('CTX_WATCH')}>
                    <div className={styles['context-menu-option-label']}>{t('CTX_WATCH')}</div>
                </Button>
                <Button className={styles['context-menu-option-container']} title={watched ? t('CTX_MARK_NON_WATCHED') : t('CTX_MARK_WATCHED')} onClick={toggleWatchedOnClick}>
                    <div className={styles['context-menu-option-label']}>{watched ? t('CTX_MARK_NON_WATCHED') : t('CTX_MARK_WATCHED')}</div>
                </Button>
                <Button className={styles['context-menu-option-container']} title={seasonWatched ? t('CTX_UNMARK_REST') : t('CTX_MARK_REST')} onClick={toggleWatchedSeasonOnClick}>
                    <div className={styles['context-menu-option-label']}>{seasonWatched ? t('CTX_UNMARK_REST') : t('CTX_MARK_REST')}</div>
                </Button>
            </div>
        );
    }, [watched, seasonWatched, toggleWatchedOnClick, toggleWatchedSeasonOnClick, popupMenuOnContextMenu, popupMenuOnKeyDown]);
    React.useEffect(() => {
        if (!routeFocused) {
            closeMenu();
        }
    }, [routeFocused]);
    return (
        <Popup
            className={className}
            id={id}
            title={title}
            thumbnail={thumbnail}
            episode={episode}
            released={released}
            upcoming={upcoming}
            watched={watched}
            progress={progress}
            scheduled={scheduled}
            onClick={videoButtonOnClick}
            {...props}
            onLongPress={popupLabelOnLongPress}
            onContextMenu={popupLabelOnContextMenu}
            open={menuOpen}
            onCloseRequest={closeMenu}
            renderLabel={renderLabel}
            renderMenu={renderMenu}
        />
    );
};

Video.Placeholder = VideoPlaceholder;

Video.propTypes = {
    className: PropTypes.string,
    id: PropTypes.string,
    title: PropTypes.string,
    thumbnail: PropTypes.string,
    season: PropTypes.number,
    episode: PropTypes.number,
    released: PropTypes.instanceOf(Date),
    upcoming: PropTypes.bool,
    watched: PropTypes.bool,
    progress: PropTypes.number,
    scheduled: PropTypes.bool,
    seasonWatched: PropTypes.bool,
    selected: PropTypes.bool,
    deepLinks: PropTypes.shape({
        metaDetailsStreams: PropTypes.string,
        player: PropTypes.string
    }),
    onSelect: PropTypes.func,
    onMarkVideoAsWatched: PropTypes.func,
    onMarkSeasonAsWatched: PropTypes.func,
    variant: PropTypes.oneOf(['casa-series']),
    runtime: PropTypes.number,
};

module.exports = Video;
