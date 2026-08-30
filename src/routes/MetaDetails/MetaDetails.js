// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const { useParams, useLocation, useNavigate } = require('react-router');
const { useTranslation } = require('react-i18next');
const classnames = require('classnames');
const { useCore } = require('stremio/core');
const { useContentGamepadNavigation } = require('stremio/services/GamepadNavigation');
const { withCoreSuspender } = require('stremio/common');
// TV fork: niente HorizontalNavBar (nessuna top bar su TV).
const { VerticalNavBar, DelayedRenderer, Image, MetaPreview, ModalDialog } = require('stremio/components');
const useEpisodeRuntimes = require('stremio/common/useEpisodeRuntimes');
const useTitleAvailability = require('stremio/common/useTitleAvailability');
const useLetterboxdRating = require('stremio/common/useLetterboxdRating');
const { digitalReleaseLabel } = require('stremio/common/casaDigitalRelease');
const StreamsList = require('./StreamsList');
const VideosList = require('./VideosList');
const useMetaDetails = require('./useMetaDetails');
const useSeason = require('./useSeason');
const useMetaExtensionTabs = require('./useMetaExtensionTabs');
const styles = require('./styles');

const GAMEPAD_HANDLER_ID = 'metadetails';

const MetaDetails = () => {
    const { type, id, videoId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const contentRef = React.useRef(null);
    const { t } = useTranslation();
    const core = useCore();
    const urlParams = React.useMemo(() => ({
        type,
        id,
        videoId
    }), [type, id, videoId]);
    const metaDetails = useMetaDetails(urlParams);
    const [season, setSeason] = useSeason(urlParams);
    const [tabs, metaExtension, clearMetaExtension] = useMetaExtensionTabs(metaDetails.metaExtensions);
    const [metaPath, streamPath] = React.useMemo(() => {
        return metaDetails.selected !== null ?
            [metaDetails.selected.metaPath, metaDetails.selected.streamPath]
            :
            [null, null];
    }, [metaDetails.selected]);
    const video = React.useMemo(() => {
        return streamPath !== null && metaDetails.metaItem !== null && metaDetails.metaItem.content.type === 'Ready' ?
            metaDetails.metaItem.content.content.videos.reduce((result, video) => {
                if (video.id === streamPath.id) {
                    return video;
                }

                return result;
            }, null)
            :
            null;
    }, [metaDetails.metaItem, streamPath]);

    // TV: track dell'episodio su cui e' il focus (non cliccato). MetaPreview
    // mostra dinamicamente i dati di QUELL'episodio (titolo, data, overview)
    // mentre l'utente naviga il rail col telecomando.
    const [focusedVideoId, setFocusedVideoId] = React.useState(null);
    const focusedVideo = React.useMemo(() => {
        if (!focusedVideoId || !metaDetails?.metaItem || metaDetails.metaItem.content.type !== 'Ready') {
            return null;
        }
        return metaDetails.metaItem.content.content.videos.find((v) => v.id === focusedVideoId) || null;
    }, [focusedVideoId, metaDetails.metaItem]);
    // Priorita': focused (hover-by-remote) > selected-by-url > null (show series-level)
    const previewVideo = focusedVideo || video;

    // TV: durata REALE dell'episodio in preview (minuti). Il `runtime` del meta
    // e' quello nominale della serie, uguale per ogni episodio -> per la riga
    // stats la prendiamo dal backend (TMDB, per stagione). Assente = non mostrata.
    // Il gate su `season` scarta la mappa della stagione precedente (race del
    // refetch post-paint, vedi useEpisodeRuntimes).
    const episodeRuntimes = useEpisodeRuntimes(type, id, previewVideo?.season);
    const previewVideoRuntime = typeof previewVideo?.episode === 'number' && episodeRuntimes.season === previewVideo.season ?
        episodeRuntimes.runtimes[String(previewVideo.episode)] ?? null
        :
        null;

    // TV Casa: data di uscita DIGITALE per i FILM (quando escono i primi rip
    // buoni). id null per le serie -> l'hook non chiama il backend. La label
    // (recenza/wording) e' calcolata da casaDigitalRelease.js; mostrata solo
    // per film recenti/imminenti.
    const movieAvailability = useTitleAvailability(type, type === 'movie' ? id : null);
    // Voto Letterboxd, accanto a quello IMDb. Solo film: Letterboxd non ha le
    // serie (li' il chip non compare proprio, invece di comparire vuoto).
    const letterboxd = useLetterboxdRating(type, type === 'movie' ? id : null);
    const movieDigitalReleaseLabel = React.useMemo(() => {
        if (type !== 'movie' || metaDetails.metaItem === null || metaDetails.metaItem.content.type !== 'Ready') {
            return null;
        }
        // Aspetta che /availability abbia risposto: altrimenti su digitalRelease
        // ancora null (fetch in volo) la label ripiega su "data non nota" e
        // LAMPEGGIA prima di sparire col dato vero. Su cache-hit loaded e' subito
        // true -> nessun ritardo percepito.
        if (!movieAvailability.loaded) {
            return null;
        }
        return digitalReleaseLabel(
            movieAvailability.digitalRelease,
            metaDetails.metaItem.content.content.released,
            Date.now()
        );
    }, [type, movieAvailability.digitalRelease, movieAvailability.loaded, metaDetails.metaItem]);
    const addToLibrary = React.useCallback(() => {
        if (metaDetails.metaItem === null || metaDetails.metaItem.content.type !== 'Ready') {
            return;
        }

        core.transport.dispatch({
            action: 'Ctx',
            args: {
                action: 'AddToLibrary',
                args: metaDetails.metaItem.content.content
            }
        });
    }, [metaDetails]);
    const removeFromLibrary = React.useCallback(() => {
        if (metaDetails.metaItem === null || metaDetails.metaItem.content.type !== 'Ready') {
            return;
        }

        core.transport.dispatch({
            action: 'Ctx',
            args: {
                action: 'RemoveFromLibrary',
                args: metaDetails.metaItem.content.content.id
            }
        });
    }, [metaDetails]);
    const toggleWatched = React.useCallback(() => {
        if (metaDetails.metaItem === null || metaDetails.metaItem.content.type !== 'Ready') {
            return;
        }

        core.transport.dispatch({
            action: 'MetaDetails',
            args: {
                action: 'MarkAsWatched',
                args: !metaDetails.metaItem.content.content.watched
            }
        });
    }, [metaDetails]);
    const toggleNotifications = React.useCallback(() => {
        if (metaDetails.libraryItem) {
            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'ToggleLibraryItemNotifications',
                    args: [metaDetails.libraryItem._id, !metaDetails.libraryItem.state.noNotif],
                }
            });
        }
    }, [metaDetails.libraryItem]);
    const seasonOnSelect = React.useCallback((event) => {
        setSeason(event.value);
    }, [setSeason]);
    const handleEpisodeSearch = React.useCallback((season, episode) => {
        const searchVideoHash = encodeURIComponent(`${urlParams.id}:${season}:${episode}`);
        const url = location.pathname;
        const searchVideoPath = (urlParams.videoId === undefined || urlParams.videoId === null || urlParams.videoId === '') ?
            url + (!url.endsWith('/') ? '/' : '') + searchVideoHash
            : url.replace(encodeURIComponent(urlParams.videoId), searchVideoHash);
        navigate(searchVideoPath, { replace: true });
    }, [urlParams, location]);

    const renderBackgroundImageFallback = React.useCallback(() => null, []);
    const renderBackground = React.useMemo(() => !!(
        metaPath &&
        metaDetails?.metaItem &&
        metaDetails.metaItem.content.type !== 'Loading' &&
        typeof metaDetails.metaItem.content.content?.background === 'string' &&
        metaDetails.metaItem.content.content.background.length > 0
    ), [metaPath, metaDetails]);

    useContentGamepadNavigation(contentRef, GAMEPAD_HANDLER_ID);
    return (
        <div className={styles['metadetails-container']}>
            {
                renderBackground ?
                    <div className={styles['background-image-layer']}>
                        <Image
                            className={styles['background-image']}
                            src={metaDetails.metaItem.content.content.background}
                            renderFallback={renderBackgroundImageFallback}
                            alt={' '}
                        />
                    </div>
                    :
                    null
            }
            {/* TV: niente horizontal nav bar. Back via gamepad B/Esc o back
                 button pill dentro la StreamsList. Fullscreen/navmenu non
                 servono su TV. contentRef resta per la gamepad nav upstream
                 (useContentGamepadNavigation) che pilota le nostre frecce. */}
            <div ref={contentRef} className={styles['metadetails-content']}>

                {
                    tabs.length > 0 ?
                        <VerticalNavBar
                            className={styles['vertical-nav-bar']}
                            tabs={tabs}
                            selected={metaExtension !== null ? metaExtension.url : null}
                        />
                        :
                        null
                }
                {
                    metaPath === null ?
                        <DelayedRenderer delay={500}>
                            <div className={styles['meta-message-container']}>
                                <Image className={styles['image']} src={require('/assets/images/empty.png')} alt={' '} />
                                <div className={styles['message-label']}>{t('ERR_NO_META_SELECTED')}</div>
                            </div>
                        </DelayedRenderer>
                        :
                        metaDetails.metaItem === null ?
                            // Durante la navigazione metaItem e' null per un
                            // istante prima che il core emetta Loading: mostrare
                            // subito l'errore "nessun addon" lo faceva LAMPEGGIARE
                            // (dati rotti visti dall'utente). Nel nostro fork
                            // Cinemeta e' sempre installato -> null e' SEMPRE lo
                            // stato transitorio di caricamento: skeleton, non
                            // errore (2026-07-17). Un fallimento vero dell'addon
                            // arriva comunque come 'Err' (ramo sotto).
                            <MetaPreview.Placeholder className={styles['meta-preview']} />
                            :
                            metaDetails.metaItem.content.type === 'Err' ?
                                <DelayedRenderer delay={1000}>
                                    <div className={styles['meta-message-container']}>
                                        <Image className={styles['image']} src={require('/assets/images/empty.png')} alt={' '} />
                                        <div className={styles['message-label']}>{t('ERR_NO_META_FOUND')}</div>
                                    </div>
                                </DelayedRenderer>
                                :
                                metaDetails.metaItem.content.type === 'Loading' ?
                                    <MetaPreview.Placeholder className={styles['meta-preview']} />
                                    :
                                    <React.Fragment>
                                        <MetaPreview
                                            className={classnames(styles['meta-preview'], 'animation-fade-in')}
                                            name={metaDetails.metaItem.content.content.name}
                                            logo={metaDetails.metaItem.content.content.logo}
                                            runtime={metaDetails.metaItem.content.content.runtime}
                                            releaseInfo={metaDetails.metaItem.content.content.releaseInfo}
                                            released={
                                                previewVideo?.released instanceof Date && !isNaN(previewVideo.released.getTime())
                                                    ? previewVideo.released
                                                    : metaDetails.metaItem.content.content.released
                                            }
                                            description={
                                                previewVideo && typeof previewVideo.overview === 'string' && previewVideo.overview.length > 0
                                                    ? previewVideo.overview
                                                    : metaDetails.metaItem.content.content.description
                                            }
                                            showNotificationsToggle={
                                                !!metaDetails.metaItem.content.content.inLibrary &&
                                                !!metaDetails.metaItem.content.content.videos?.length
                                            }
                                            notificationsEnabled={!metaDetails.libraryItem?.state?.noNotif}
                                            toggleNotifications={metaDetails.libraryItem ? toggleNotifications : null}
                                            focusedEpisode={previewVideo}
                                            focusedEpisodeRuntime={previewVideoRuntime}
                                            movieDigitalReleaseLabel={movieDigitalReleaseLabel}
                                            letterboxdRating={letterboxd.rating}
                                            letterboxdSlug={letterboxd.slug}
                                            /* Per i FILM la pagina streams e' anche la pagina
                                             * di dettaglio (non c'e' episode list prima), quindi
                                             * manteniamo visibili Trailer/Add to Lib/Mark as
                                             * watched. Per le SERIE in streams mode nascondiamo
                                             * perche' l'utente ha gia' scelto l'episodio. */
                                            hideActions={streamPath !== null && streamPath.type !== 'movie'}
                                            showWatchedToggle={metaDetails.metaItem.content.content.type === 'movie'}
                                            links={metaDetails.metaItem.content.content.links}
                                            trailerStreams={metaDetails.metaItem.content.content.trailerStreams}
                                            inLibrary={metaDetails.metaItem.content.content.inLibrary}
                                            toggleInLibrary={metaDetails.metaItem.content.content.inLibrary ? removeFromLibrary : addToLibrary}
                                            watched={metaDetails.metaItem.content.content.watched}
                                            toggleWatched={toggleWatched}
                                            metaId={metaDetails.metaItem.content.content.id}
                                            ratingInfo={metaDetails.ratingInfo}
                                        />
                                    </React.Fragment>
                }
                <div className={styles['spacing']} />
                {
                    streamPath !== null ?
                        <StreamsList
                            className={styles['streams-list']}
                            streams={metaDetails.streams}
                            video={video}
                            type={streamPath.type}
                            onEpisodeSearch={handleEpisodeSearch}
                        />
                        :
                        metaPath !== null ?
                            <VideosList
                                className={styles['videos-list']}
                                metaItem={metaDetails.metaItem}
                                libraryItem={metaDetails.libraryItem}
                                season={season}
                                selectedVideoId={metaDetails.libraryItem?.state?.video_id}
                                seasonOnSelect={seasonOnSelect}
                                onFocusedVideoChange={setFocusedVideoId}
                            />
                            :
                            null
                }
            </div>
            {
                metaExtension !== null ?
                    <ModalDialog
                        className={styles['meta-extension-modal-container']}
                        title={metaExtension.name}
                        onCloseRequest={clearMetaExtension}>
                        <iframe
                            className={styles['meta-extension-modal-iframe']}
                            sandbox={'allow-forms allow-scripts allow-same-origin'}
                            src={metaExtension.url}
                        />
                    </ModalDialog>
                    :
                    null
            }
        </div>
    );
};

// TV: fallback minimale durante core-suspend (niente HBar/profile).
const MetaDetailsFallback = () => (
    <div className={styles['metadetails-container']} />
);

module.exports = withCoreSuspender(MetaDetails, MetaDetailsFallback);
