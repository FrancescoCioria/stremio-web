// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { t } = require('i18next');
const { useCore } = require('stremio/core');
const { useProfile } = require('stremio/common');
const { Image, SearchBar, Toggle, Video } = require('stremio/components');
const SeasonsBar = require('./SeasonsBar');
const { default: EpisodePicker } = require('../EpisodePicker');
const styles = require('./styles');

// Scroll position della lista episodi, preservata tra un click su un episodio
// e il ritorno alla lista (bugfix upstream: keep scroll position).
let savedScrollTop = 0;

const VideosList = ({ className, metaItem, libraryItem, season, seasonOnSelect, selectedVideoId, toggleNotifications, onFocusedVideoChange }) => {
    const core = useCore();
    const profile = useProfile();

    // Track quale episodio ha il focus adesso (non clicked, solo focused) cosi'
    // il MetaPreview di sopra puo' aggiornarsi dinamicamente con i dati
    // dell'episodio su cui l'utente sta "hovering" via telecomando.
    //
    // Usiamo DOM listeners (focusin/focusout) via CALLBACK REF invece di
    // onFocusCapture React: (1) il Popup di Video puo' portalare l'elemento
    // focusable fuori dal React tree del wrapper; (2) useEffect con [] non
    // basta perche' al primo mount il container non esiste ancora (rendering
    // condizionale). La callback ref invece viene chiamata da React appena
    // il nodo esiste.
    const videosContainerRef = React.useRef(null);
    const [focusedVideoId, setFocusedVideoId] = React.useState(null);
    React.useEffect(() => {
        if (typeof onFocusedVideoChange === 'function') {
            onFocusedVideoChange(focusedVideoId);
        }
    }, [focusedVideoId, onFocusedVideoChange]);
    const setVideosContainerRef = React.useCallback((el) => {
        const prev = videosContainerRef.current;
        if (prev && prev._casaTvCleanup) prev._casaTvCleanup();
        videosContainerRef.current = el;
        if (!el) return;
        const onFocusIn = (e) => {
            let n = e.target;
            while (n && n !== el) {
                if (n.dataset && n.dataset.videoId) {
                    setFocusedVideoId(n.dataset.videoId);
                    return;
                }
                n = n.parentNode;
            }
        };
        const onFocusOut = (e) => {
            if (!el.contains(e.relatedTarget)) setFocusedVideoId(null);
        };
        el.addEventListener('focusin', onFocusIn);
        el.addEventListener('focusout', onFocusOut);
        el._casaTvCleanup = () => {
            el.removeEventListener('focusin', onFocusIn);
            el.removeEventListener('focusout', onFocusOut);
        };
    }, []);

    const initialFocusDoneRef = React.useRef(null);
    const isMountedRef = React.useRef(false);

    // Salva la scroll position quando l'utente apre un episodio, cosi' al
    // ritorno alla lista riprende da dove era (bugfix upstream).
    const saveScrollPosition = React.useCallback(() => {
        savedScrollTop = videosContainerRef.current?.scrollTop ?? 0;
    }, []);

    // Ripristina lo scroll al mount (prima del paint), consumandolo subito.
    React.useLayoutEffect(() => {
        if (savedScrollTop > 0 && videosContainerRef.current) {
            videosContainerRef.current.scrollTop = savedScrollTop;
            savedScrollTop = 0;
        }
    }, []);

    // Arrow nav interna: ArrowLeft/Right saltano IMMEDIATAMENTE alla card
    // sibling (senza passare per lo scroll nativo di Chrome che scorre di
    // ~40px per volta e richiede piu' pressioni per arrivare alla card
    // successiva quando quella attuale e' ai bordi del viewport).
    // ArrowUp porta alle Season pills; ArrowDown non fa nulla (rail e'
    // l'ultima zona utile).
    const onVideosKeyDown = React.useCallback((e) => {
        if (e.key === 'ArrowUp') {
            // Trova la prima Season pill focusabile nell'antenato
            // meta-details-content e portaci il focus.
            const container = videosContainerRef.current;
            if (!container) return;
            const content = container.closest('[class*="metadetails-content"]') || container.parentElement?.parentElement;
            if (!content) return;
            const seasonPill = content.querySelector('[class*="seasons-bar-container"] [class*="season-pill"], [class*="seasons-bar-container"] button');
            if (!seasonPill) return;
            e.preventDefault();
            e.stopPropagation();
            seasonPill.focus({ preventScroll: true });
            return;
        }
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const container = videosContainerRef.current;
        if (!container) return;
        const current = e.target.closest('[data-video-id]');
        if (!current) return;
        const target = e.key === 'ArrowRight' ? current.nextElementSibling : current.previousElementSibling;
        if (!target || !target.dataset || !target.dataset.videoId) return;
        e.preventDefault();
        e.stopPropagation();
        const focusable = target.querySelector('[tabindex], a, button') || target;
        focusable.focus({ preventScroll: true });
        // Wrapper ha display: contents (no box) -> scrollIntoView e' no-op.
        // Scrolla l'elemento focusable, che ha box layout vero.
        focusable.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, []);

    const showNotificationsToggle = React.useMemo(() => {
        return metaItem?.content?.content?.inLibrary && metaItem?.content?.content?.videos?.length;
    }, [metaItem]);
    const videos = React.useMemo(() => {
        return metaItem && metaItem.content.type === 'Ready' ?
            metaItem.content.content.videos
            :
            [];
    }, [metaItem]);
    const seasons = React.useMemo(() => {
        return videos
            .map(({ season }) => season)
            .filter((season, index, seasons) => {
                return season !== null &&
                    !isNaN(season) &&
                    typeof season === 'number' &&
                    seasons.indexOf(season) === index;
            })
            .sort((a, b) => (a || Number.MAX_SAFE_INTEGER) - (b || Number.MAX_SAFE_INTEGER));
    }, [videos]);
    const selectedSeason = React.useMemo(() => {
        if (seasons.includes(season)) {
            return season;
        }

        const video = videos?.find((video) => video.id === libraryItem?.state.video_id);

        if (video && video.season && seasons.includes(video.season)) {
            return video.season;
        }

        const nonSpecialSeasons = seasons.filter((season) => season !== 0);
        if (nonSpecialSeasons.length > 0) {
            return nonSpecialSeasons[0];
        }

        if (seasons.length > 0) {
            return seasons[0];
        }

        return null;
    }, [seasons, season, videos, libraryItem]);
    const videosForSeason = React.useMemo(() => {
        return videos
            .filter((video) => {
                return selectedSeason === null || video.season === selectedSeason;
            })
            .sort((a, b) => {
                return a.episode - b.episode;
            });
    }, [videos, selectedSeason]);

    // Default focus: al primo load di una stagione porta il focus sul primo
    // episodio NON VISTO (o il primo in assoluto se sono tutti visti), cosi'
    // l'utente da telecomando trova subito il punto di ripresa. IMPORTANTE:
    // questo effect deve stare DOPO la definizione di videosForSeason/
    // selectedSeason — altrimenti i deps vengono captured come undefined
    // (TDZ hoisting di Babel) e React non ri-fire mai l'effect.
    React.useEffect(() => {
        const container = videosContainerRef.current;
        if (!container || videosForSeason.length === 0) return;
        if (initialFocusDoneRef.current === selectedSeason) return;
        // Se l'utente sta scorrendo le SEASON pills (filtraggio live
        // al focus), NON rubare il focus portandolo sul primo episodio —
        // l'utente vuole restare sulle pills per saltare rapidamente
        // tra S1/S2/S5. Auto-focus episodio solo al primo ingresso.
        const ae = document.activeElement;
        const onSeasonPill = ae && ae.closest && ae.closest('[class*="season-pill"]');
        if (onSeasonPill) {
            initialFocusDoneRef.current = selectedSeason;
            return;
        }
        initialFocusDoneRef.current = selectedSeason;
        // Priorita': l'episodio "corrente" e' quello dove l'utente sta
        // riprendendo, NON il prossimo da vedere. Ordine:
        //   1. selectedVideoId (libraryItem.state.video_id = ultimo che l'utente ha aperto)
        //   2. episodio con progress > 0 (in corso)
        //   3. ultimo watched in ordine episodio
        //   4. primo non visto
        //   5. primo episodio
        const target =
            (selectedVideoId && videosForSeason.find((v) => v.id === selectedVideoId)) ||
            videosForSeason.find((v) => typeof v.progress === 'number' && v.progress > 0 && !v.watched) ||
            [...videosForSeason].reverse().find((v) => v.watched) ||
            videosForSeason.find((v) => !v.watched) ||
            videosForSeason[0];
        if (!target) return;
        const tid = setTimeout(() => {
            const sel = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(target.id) : target.id;
            const card = container.querySelector(`[data-video-id="${sel}"]`);
            if (!card) return;
            const el = card.querySelector('[tabindex], a, button') || card;
            el.focus();
            // card e' il wrapper display:contents (no box) -> scrolla el.
            el.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' });
        }, 0);
        return () => clearTimeout(tid);
    }, [videosForSeason, selectedSeason]);

    const seasonWatched = React.useMemo(() => {
        return videosForSeason.every((video) => video.watched);
    }, [videosForSeason]);

    // Scroll in cima al cambio stagione (skip al primo mount per rispettare
    // lo scroll ripristinato). Bugfix upstream: integrato perche' non
    // interferisce con la nav TV (l'auto-focus episodio gestisce il focus,
    // questo gestisce solo lo scroll del container quando non c'e' un
    // episodio selezionato nella nuova stagione).
    React.useEffect(() => {
        if (!isMountedRef.current) {
            isMountedRef.current = true;
            return;
        }
        const hasSelectedVideo = videosForSeason.some((v) => v.id === selectedVideoId);
        if (!hasSelectedVideo && videosContainerRef.current) {
            videosContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [selectedSeason]);

    // TV: niente SearchBar locale — il filtraggio via tastiera da divano e'
    // assurdo. Manteniamo lo state per compat con il rendering esistente ma
    // con stringa vuota fissa (mostra tutti).
    const search = '';

    const onMarkVideoAsWatched = (video, watched) => {
        core.transport.dispatch({
            action: 'MetaDetails',
            args: {
                action: 'MarkVideoAsWatched',
                args: [video, !watched]
            }
        });
    };

    const onMarkSeasonAsWatched = (season, watched) => {
        core.transport.dispatch({
            action: 'MetaDetails',
            args: {
                action: 'MarkSeasonAsWatched',
                args: [season, !watched]
            }
        });
    };

    const onSeasonSearch = (value) => {
        if (value) {
            seasonOnSelect({
                type: 'select',
                value,
            });
        }
    };

    return (
        <div className={classnames(className, styles['videos-list-container'])}>
            {
                !metaItem || metaItem.content.type === 'Loading' ?
                    <React.Fragment>
                        <SeasonsBar.Placeholder className={styles['seasons-bar']} />
                        <SearchBar.Placeholder className={styles['search-bar']} title={t('SEARCH_VIDEOS')} />
                        <div className={styles['videos-scroll-container']}>
                            <Video.Placeholder />
                            <Video.Placeholder />
                            <Video.Placeholder />
                            <Video.Placeholder />
                            <Video.Placeholder />
                        </div>
                    </React.Fragment>
                    :
                    metaItem.content.type === 'Err' || videosForSeason.length === 0 ?
                        <div className={styles['message-container']}>
                            <EpisodePicker className={styles['episode-picker']} onSubmit={onSeasonSearch} />
                            <Image className={styles['image']} src={require('/assets/images/empty.png')} alt={' '} />
                            <div className={styles['label']}>{t('ERR_NO_VIDEOS_FOR_META')}</div>
                        </div>
                        :
                        <React.Fragment>
                            {
                                showNotificationsToggle && libraryItem ?
                                    <Toggle className={styles['notifications-toggle']} checked={!libraryItem.state.noNotif} onClick={toggleNotifications}>
                                        {t('DETAIL_RECEIVE_NOTIF_SERIES')}
                                    </Toggle>
                                    :
                                    null
                            }
                            {
                                seasons.length > 0 ?
                                    <SeasonsBar
                                        className={styles['seasons-bar']}
                                        season={selectedSeason}
                                        seasons={seasons}
                                        onSelect={seasonOnSelect}
                                    />
                                    :
                                    null
                            }
                            <div
                                ref={setVideosContainerRef}
                                className={styles['videos-container']}
                                onKeyDown={onVideosKeyDown}
                            >
                                {
                                    videosForSeason
                                        .filter((video) => {
                                            return search.length === 0 ||
                                                (
                                                    (typeof video.title === 'string' && video.title.toLowerCase().includes(search.toLowerCase())) ||
                                                    (!isNaN(video.released.getTime()) && video.released.toLocaleString(profile.settings.interfaceLanguage, { year: '2-digit', month: 'short', day: 'numeric' }).toLowerCase().includes(search.toLowerCase()))
                                                );
                                        })
                                        .map((video, index) => (
                                            <div
                                                key={index}
                                                className={styles['video-wrapper']}
                                                data-video-id={video.id}
                                            >
                                                <Video
                                                    id={video.id}
                                                    title={video.title}
                                                    thumbnail={video.thumbnail}
                                                    season={video.season}
                                                    episode={video.episode}
                                                    released={video.released}
                                                    upcoming={video.upcoming}
                                                    watched={video.watched}
                                                    progress={video.progress}
                                                    deepLinks={video.deepLinks}
                                                    scheduled={video.scheduled}
                                                    seasonWatched={seasonWatched}
                                                    selected={video.id === selectedVideoId}
                                                    onSelect={saveScrollPosition}
                                                    onMarkVideoAsWatched={onMarkVideoAsWatched}
                                                    onMarkSeasonAsWatched={onMarkSeasonAsWatched}
                                                />
                                            </div>
                                        ))
                                }
                            </div>
                        </React.Fragment>
            }
        </div>
    );
};

VideosList.propTypes = {
    className: PropTypes.string,
    metaItem: PropTypes.object,
    libraryItem: PropTypes.object,
    season: PropTypes.number,
    selectedVideoId: PropTypes.string,
    seasonOnSelect: PropTypes.func,
    toggleNotifications: PropTypes.func,
    onFocusedVideoChange: PropTypes.func,
};

module.exports = VideosList;
