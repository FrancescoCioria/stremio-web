// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const { useParams, useNavigate } = require('react-router');
const { useSearchParams } = require('react-router-dom');
const classnames = require('classnames');
const debounce = require('lodash.debounce');
const langs = require('langs');
const { useTranslation } = require('react-i18next');
const { default: useRouteFocused } = require('stremio/common/useRouteFocused');
const { useCore } = require('stremio/core');
const { useServices, useGamepad } = require('stremio/services');
const { useContentGamepadNavigation } = require('stremio/services/GamepadNavigation');
const { useSettings, useProfile, useFullscreen, useBinaryState, useToast, useStreamingServer, withCoreSuspender, usePlatform, onShortcut, useDiscord, EMPTY_DISCORD_TIMESTAMPS, getPlaybackDiscordActivity } = require('stremio/common');
const { default: toPath } = require('stremio-router/toPath');
const { HorizontalNavBar, Transition, ContextMenu } = require('stremio/components');
const { default: Buffering } = require('./Buffering');
const VolumeChangeIndicator = require('./VolumeChangeIndicator');
const Error = require('./Error');
const ControlBar = require('./ControlBar');
const NextVideoPopup = require('./NextVideoPopup');
const StatisticsMenu = require('./StatisticsMenu');
const OptionsMenu = require('./OptionsMenu');
const SubtitlesMenu = require('./SubtitlesMenu');
const { default: AudioMenu } = require('./AudioMenu');
const SpeedMenu = require('./SpeedMenu');
const { default: SideDrawer } = require('./SideDrawer');
const usePlayer = require('./usePlayer');
const useStatistics = require('./useStatistics');
const usePlayerDebugLog = require('./usePlayerDebugLog');
const useSubtitleDebugLog = require('./useSubtitleDebugLog');
const useNextEpisodePrewarm = require('./useNextEpisodePrewarm');
const useStallWatchdog = require('./useStallWatchdog');
const useVideo = require('./useVideo');
const { default: useSubtitles } = require('./useSubtitles');
const styles = require('./styles');
const Video = require('./Video');
const { default: Indicator } = require('./Indicator/Indicator');
const { default: useMediaSession } = require('./useMediaSession');
const { rememberStream } = require('stremio/common/lastStream');

const findTrackByLang = (tracks, lang) => tracks.find((track) => track.lang === lang || langs.where('1', track.lang)?.[2] === lang);
const findTrackById = (tracks, id) => tracks.find((track) => track.id === id);

const GAMEPAD_HANDLER_ID = 'player';

const Player = () => {
    const { stream, streamTransportUrl, metaTransportUrl, type, id, videoId } = useParams();
    const urlParams = React.useMemo(() => ({
        stream,
        streamTransportUrl,
        metaTransportUrl,
        type,
        id,
        videoId
    }), [stream, streamTransportUrl, metaTransportUrl, type, id, videoId]);
    const [queryParams] = useSearchParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const services = useServices();
    const core = useCore();
    const gamepad = useGamepad();
    const forceTranscoding = React.useMemo(() => {
        return queryParams.has('forceTranscoding');
    }, [queryParams]);
    const profile = useProfile();
    const [player, videoParamsChanged, streamStateChanged, timeChanged, seek, pausedChanged, ended, nextVideo] = usePlayer(urlParams);
    const [settings] = useSettings();
    const streamingServer = useStreamingServer();
    const statistics = useStatistics(player, streamingServer);
    const video = useVideo();
    usePlayerDebugLog(video, streamingServer, statistics); // DEBUG: log pause/buffering + stato torrent al backend
    useSubtitleDebugLog(video); // DEBUG: log stato texttrack per bug sottotitoli embedded che spariscono
    useNextEpisodePrewarm(player, video, type); // scalda il prossimo episodio su TorrServer (custom Casa)
    const routeFocused = useRouteFocused();
    const platform = usePlatform();
    const toast = useToast();
    const discord = useDiscord();
    const discordTimestamps = React.useRef(EMPTY_DISCORD_TIMESTAMPS);

    const [seeking, setSeeking] = React.useState(false);

    const [casting, setCasting] = React.useState(() => {
        return services.chromecast.active && services.chromecast.transport.getCastState() === cast.framework.CastState.CONNECTED;
    });
    const playbackDevices = React.useMemo(() => streamingServer.playbackDevices !== null && streamingServer.playbackDevices.type === 'Ready' ? streamingServer.playbackDevices.content : [], [streamingServer]);

    const playerRef = React.useRef(null);
    const bufferingRef = React.useRef();
    const errorRef = React.useRef();

    const [immersed, setImmersed] = React.useState(true);
    const setImmersedDebounced = React.useCallback(debounce(setImmersed, 3000), []);

    // TV navigation mode. Tre stati:
    //   null      = focus sul video (default). ←/→ seek, Enter play/pause.
    //   'seekbar' = focus sulla SeekBar (timeline). ←/→ seek, ↓ entra
    //               sui bottoni, ↑ torna al video.
    //   'buttons' = focus su uno dei bottoni del control bar. ←/→ navigano
    //               i bottoni adiacenti, Enter attiva il bottone (browser
    //               nativo via tabIndex=0). seekForward/Backward e playPause
    //               shortcut sono disabilitati in questo stato.
    const [tvNavMode, setTvNavMode] = React.useState(null);
    // Mirror in ref: i keydown handler dentro useLayoutEffect leggono lo
    // stato senza dover ricreare i listener ad ogni cambio di tvNavMode
    // (8 add/removeEventListener evitati per ogni transizione null->seekbar
    // ->buttons).
    const tvNavModeRef = React.useRef(tvNavMode);
    React.useEffect(() => { tvNavModeRef.current = tvNavMode; }, [tvNavMode]);
    const [fullscreen, , , toggleFullscreen, , setVideoElement] = useFullscreen();

    React.useEffect(() => {
        const el = video.containerRef.current?.querySelector('video');
        setVideoElement(el || null);
        return () => setVideoElement(null);
    }, [video.state.manifest]);

    const [optionsMenuOpen, , closeOptionsMenu] = useBinaryState(false);
    const [subtitlesMenuOpen, , closeSubtitlesMenu, toggleSubtitlesMenu] = useBinaryState(false);
    const [audioMenuOpen, , closeAudioMenu, toggleAudioMenu] = useBinaryState(false);
    const [speedMenuOpen, , closeSpeedMenu, toggleSpeedMenu] = useBinaryState(false);
    const [statisticsMenuOpen, openStatisticsMenu, closeStatisticsMenu, toggleStatisticsMenu] = useBinaryState(false);
    const [nextVideoPopupOpen, openNextVideoPopup, closeNextVideoPopup] = useBinaryState(false);
    const [sideDrawerOpen, , closeSideDrawer, toggleSideDrawer] = useBinaryState(false);

    const menusOpen = React.useMemo(() => {
        return optionsMenuOpen || subtitlesMenuOpen || audioMenuOpen || speedMenuOpen || statisticsMenuOpen || sideDrawerOpen || nextVideoPopupOpen;
    }, [optionsMenuOpen, subtitlesMenuOpen, audioMenuOpen, speedMenuOpen, statisticsMenuOpen, sideDrawerOpen, nextVideoPopupOpen]);

    const closeMenus = React.useCallback(() => {
        closeOptionsMenu();
        closeSubtitlesMenu();
        closeAudioMenu();
        closeSpeedMenu();
        closeStatisticsMenu();
        closeSideDrawer();
    }, []);

    const {
        streamSubtitles,
        allSubtitleTracks,
        extraSubtitleTracks,
        selectedExtraSubtitleTrackId,
        subtitlesMenuProps,
    } = useSubtitles({
        player,
        video,
        settings,
        streamStateChanged,
        menusOpen,
        closeMenus,
        closeSubtitlesMenu,
        toggleSubtitlesMenu,
    });

    const overlayHidden = React.useMemo(() => {
        // Quando l'utente sta navigando con frecce nel control bar, l'overlay
        // (seek bar + bottoni) DEVE restare visibile a prescindere dallo
        // stato di immersione.
        if (tvNavMode !== null) return false;
        return immersed && !casting && video.state.paused !== null && !video.state.paused && !menusOpen;
    }, [immersed, casting, video.state.paused, menusOpen, tvNavMode]);

    const nextVideoPopupDismissed = React.useRef(false);
    const defaultAudioTrackSelected = React.useRef(false);
    const playingOnExternalDevice = React.useRef(false);
    const [error, setError] = React.useState(null);
    const lastLoadRef = React.useRef(null);

    const playbackSpeed = React.useRef(video.state.playbackSpeed || 1);
    const pressTimer = React.useRef(null);
    const longPress = React.useRef(false);
    const controlBarRef = React.useRef(null);

    const HOLD_DELAY = 400;

    const handleNextVideoNavigation = React.useCallback((deepLinks, bingeWatching, ended) => {
        if (ended) {
            if (bingeWatching) {
                if (deepLinks.player) {
                    navigate(toPath(deepLinks.player), { replace: true });
                } else if (deepLinks.metaDetailsStreams) {
                    navigate(toPath(deepLinks.metaDetailsStreams), { replace: true });
                }
            } else {
                navigate(-1);
            }

        } else {
            if (deepLinks.player) {
                navigate(toPath(deepLinks.player), { replace: true });
            } else if (deepLinks.metaDetailsStreams) {
                navigate(toPath(deepLinks.metaDetailsStreams), { replace: true });
            }
        }
    }, []);

    const onEnded = React.useCallback(() => {
        ended();
        if (player.nextVideo !== null) {
            nextVideo();

            const deepLinks = player.nextVideo.deepLinks;
            handleNextVideoNavigation(deepLinks, profile.settings.bingeWatching, true);
        } else {
            navigate(-1);
        }
    }, [player.nextVideo, profile.settings.bingeWatching, handleNextVideoNavigation]);

    const onError = React.useCallback((error) => {
        console.error('Player', error);
        if (error.critical) {
            setError(error);
        } else {
            toast.show({
                type: 'error',
                title: t('ERROR'),
                message: error.message,
                timeout: 3000
            });
        }
    }, []);

    const onPlayRequested = React.useCallback(() => {
        playingOnExternalDevice.current = false;
        video.setPaused(false);
        setSeeking(false);
    }, []);

    const onPlayRequestedDebounced = React.useCallback(debounce(onPlayRequested, 200), []);

    const onPauseRequested = React.useCallback(() => {
        video.setPaused(true);
    }, []);

    const onPauseRequestedDebounced = React.useCallback(debounce(onPauseRequested, 200), []);
    const onMuteRequested = React.useCallback(() => {
        video.setMuted(true);
    }, []);

    const onUnmuteRequested = React.useCallback(() => {
        video.setMuted(false);
    }, []);

    const onVolumeChangeRequested = React.useCallback((volume) => {
        video.setVolume(volume);
    }, []);

    const onSeekRequested = React.useCallback((time) => {
        video.setTime(time);
        seek(time, video.state.duration, video.state.manifest?.name);
    }, [video.state.duration, video.state.manifest]);

    const onPlaybackSpeedChanged = React.useCallback((rate, skipUpdate) => {
        video.setPlaybackSpeed(rate);

        if (skipUpdate) return;

        playbackSpeed.current = rate;

    }, []);

    const onAudioTrackSelected = React.useCallback((id) => {
        video.setAudioTrack(id);
        streamStateChanged({
            audioTrack: {
                id,
            },
        });
    }, [streamStateChanged]);

    const onDismissNextVideoPopup = React.useCallback(() => {
        closeNextVideoPopup();
        nextVideoPopupDismissed.current = true;
    }, []);

    const onNextVideoRequested = React.useCallback(() => {
        if (player.nextVideo !== null) {
            nextVideo();

            const deepLinks = player.nextVideo.deepLinks;
            handleNextVideoNavigation(deepLinks, profile.settings.bingeWatching, false);
        }
    }, [player.nextVideo, handleNextVideoNavigation, profile.settings]);

    const onVideoClick = React.useCallback(() => {
        if (video.state.paused !== null && !longPress.current) {
            if (video.state.paused) {
                onPlayRequestedDebounced();
            } else {
                onPauseRequestedDebounced();
            }
        }
    }, [video.state.paused, longPress.current]);

    const onVideoDoubleClick = React.useCallback(() => {
        onPlayRequestedDebounced.cancel();
        onPauseRequestedDebounced.cancel();
        toggleFullscreen();
    }, [toggleFullscreen]);

    const onContainerMouseDown = React.useCallback((event) => {
        if (!event.nativeEvent.optionsMenuClosePrevented) {
            closeOptionsMenu();
        }
        if (!event.nativeEvent.subtitlesMenuClosePrevented) {
            closeSubtitlesMenu();
        }
        if (!event.nativeEvent.audioMenuClosePrevented) {
            closeAudioMenu();
        }
        if (!event.nativeEvent.speedMenuClosePrevented) {
            closeSpeedMenu();
        }
        if (!event.nativeEvent.statisticsMenuClosePrevented) {
            closeStatisticsMenu();
        }

        closeSideDrawer();
    }, []);

    const onContainerMouseMove = React.useCallback((event) => {
        setImmersed(false);
        if (!event.nativeEvent.immersePrevented) {
            setImmersedDebounced(true);
        } else {
            setImmersedDebounced.cancel();
        }
    }, []);

    const onContainerMouseLeave = React.useCallback(() => {
        setImmersedDebounced.cancel();
        setImmersed(true);
    }, []);

    const onBarMouseMove = React.useCallback((event) => {
        event.nativeEvent.immersePrevented = true;
    }, []);

    const onPlayPause = React.useCallback(() => {
        if (!menusOpen && !nextVideoPopupOpen && video.state.paused !== null) {
            if (video.state.paused) {
                onPlayRequested();
                setSeeking(false);
            } else {
                onPauseRequested();
            }
        }
    }, [menusOpen, nextVideoPopupOpen, video.state.paused]);

    const onSeekPrev = React.useCallback((event) => {
        if (!menusOpen && !nextVideoPopupOpen && video.state.time !== null) {
            const seekDuration = event?.shiftKey ? settings.seekShortTimeDuration : settings.seekTimeDuration;
            const seekTime = video.state.time - seekDuration;
            setSeeking(true);
            onSeekRequested(Math.max(seekTime, 0));
        }
    }, [menusOpen, nextVideoPopupOpen, video.state.time]);

    const onSeekNext = React.useCallback((event) => {
        if (!menusOpen && !nextVideoPopupOpen && video.state.time !== null) {
            const seekDuration = event?.shiftKey ? settings.seekShortTimeDuration : settings.seekTimeDuration;
            setSeeking(true);
            onSeekRequested(video.state.time + seekDuration);
        }
    }, [menusOpen, nextVideoPopupOpen, video.state.time]);

    const onVolumeUp = React.useCallback(() => {
        if (!menusOpen && !nextVideoPopupOpen && video.state.volume !== null) {
            onVolumeChangeRequested(Math.min(video.state.volume + 5, 200));
        }
    }, [menusOpen, nextVideoPopupOpen, video.state.volume]);

    const onVolumeDown = React.useCallback(() => {
        if (!menusOpen && !nextVideoPopupOpen && video.state.volume !== null) {
            onVolumeChangeRequested(Math.max(video.state.volume - 5, 0));
        }
    }, [menusOpen, nextVideoPopupOpen, video.state.volume]);

    const onGamepadSeekAndVol = React.useCallback((axis) => {
        switch(axis) {
            case 'left': {
                onSeekPrev();
                break;
            }
            case 'right': {
                onSeekNext();
                break;
            }
            case 'up': {
                onVolumeUp();
                break;
            }
            case 'down': {
                onVolumeDown();
                break;
            }
        }
    }, [onSeekPrev, onSeekNext, onVolumeUp, onVolumeDown]);

    useContentGamepadNavigation(playerRef, GAMEPAD_HANDLER_ID);

    React.useEffect(() => {
        gamepad?.on('buttonX', GAMEPAD_HANDLER_ID, onPlayPause);
        gamepad?.on('analogRight', GAMEPAD_HANDLER_ID, onGamepadSeekAndVol);

        return () => {
            gamepad?.off('buttonX', GAMEPAD_HANDLER_ID);
            gamepad?.off('analogRight', GAMEPAD_HANDLER_ID);
        };
    }, [onPlayPause, onGamepadSeekAndVol]);

    React.useEffect(() => {
        setError(null);
        video.unload();

        if (player.selected && player.stream?.type === 'Ready' && streamingServer.settings?.type !== 'Loading') {
            const loadArgs = {
                stream: {
                    ...player.stream.content,
                    subtitles: streamSubtitles
                },
                autoplay: true,
                time: player.libraryItem !== null &&
                    player.selected.streamRequest !== null &&
                    player.selected.streamRequest.path !== null &&
                    player.libraryItem.state.video_id === player.selected.streamRequest.path.id ?
                    player.libraryItem.state.timeOffset
                    :
                    0,
                forceTranscoding: forceTranscoding || casting,
                maxAudioChannels: settings.surroundSound ? 32 : 2,
                hardwareDecoding: settings.hardwareDecoding,
                assSubtitlesStyling: settings.assSubtitlesStyling,
                gpuVideoProcessing: settings.gpuVideoProcessing && platform.shell.capabilities.gpuVideoProcessing,
                videoMode: settings.videoMode,
                platform: platform.name,
                streamingServerURL: streamingServer.baseUrl ?
                    casting ?
                        streamingServer.baseUrl
                        :
                        streamingServer.selected.transportUrl
                    :
                    null,
                seriesInfo: player.seriesInfo,
            };
            const loadOptions = {
                chromecastTransport: services.chromecast.active ? services.chromecast.transport : null,
                shellTransport: platform.shell.active ? platform.shell : null,
            };
            // Casa: memorizzati per il watchdog anti-stallo (ricarica dallo
            // stesso punto senza rifare tutta questa derivazione).
            lastLoadRef.current = { loadArgs, loadOptions };
            video.load(loadArgs, loadOptions);
        }
    }, [streamingServer.baseUrl, player.selected, player.stream, streamSubtitles, forceTranscoding, casting]);

    // Casa: se il player resta appeso in buffering senza avanzare (append MSE
    // che non si completa mai: nessun errore, nessun frammento nuovo chiesto),
    // ricrea l'istanza hls dallo stesso punto. Vedi useStallWatchdog.js.
    const reloadStream = React.useCallback((time) => {
        const last = lastLoadRef.current;
        if (last === null) return;

        video.unload();
        video.load({
            ...last.loadArgs,
            time: typeof time === 'number' ? time : last.loadArgs.time,
        }, last.loadOptions);
    }, []);

    useStallWatchdog(video.state, reloadStream);

    React.useEffect(() => {
        !seeking && timeChanged(video.state.time, video.state.duration, video.state.manifest?.name);
    }, [video.state.time, video.state.duration, video.state.manifest, seeking]);

    React.useEffect(() => {
        if (playingOnExternalDevice.current && video.state.paused === false) {
            onPauseRequested();
        } else if (video.state.paused !== null) {
            pausedChanged(video.state.paused);
        }
    }, [video.state.paused]);

    React.useEffect(() => {
        videoParamsChanged(video.state.videoParams);
    }, [video.state.videoParams]);

    React.useEffect(() => {
        if (player.nextVideo !== null && !nextVideoPopupDismissed.current) {
            if (video.state.time !== null && video.state.duration !== null && video.state.time < video.state.duration && (video.state.duration - video.state.time) <= settings.nextVideoNotificationDuration) {
                openNextVideoPopup();
            } else {
                closeNextVideoPopup();
            }
        }
    }, [player.nextVideo, video.state.time, video.state.duration]);

    // Auto audio track selection
    React.useEffect(() => {
        if (!defaultAudioTrackSelected.current) {
            const savedTrackId = player.streamState?.audioTrack?.id;
            const savedTrack = savedTrackId ? findTrackById(video.state.audioTracks, savedTrackId) : null;
            const audioTrack = savedTrack ?? findTrackByLang(video.state.audioTracks, settings.audioLanguage);

            if (audioTrack && audioTrack.id) {
                video.setAudioTrack(audioTrack.id);
                defaultAudioTrackSelected.current = true;
            }
        }
    }, [video.state.audioTracks, player.streamState]);

    React.useEffect(() => {
        defaultAudioTrackSelected.current = false;
        nextVideoPopupDismissed.current = false;
        playingOnExternalDevice.current = false;
    }, [video.state.stream]);

    React.useEffect(() => {
        if (!Array.isArray(video.state.audioTracks) || video.state.audioTracks.length === 0) {
            closeAudioMenu();
        }
    }, [video.state.audioTracks]);

    React.useEffect(() => {
        if (video.state.playbackSpeed === null) {
            closeSpeedMenu();
        }
    }, [video.state.playbackSpeed]);

    React.useEffect(() => {
        const toastFilter = (item) => item?.dataset?.type === 'CoreEvent';
        toast.addFilter(toastFilter);
        const onCastStateChange = () => {
            setCasting(services.chromecast.active && services.chromecast.transport.getCastState() === cast.framework.CastState.CONNECTED);
        };
        const onChromecastServiceStateChange = () => {
            onCastStateChange();
            if (services.chromecast.active) {
                services.chromecast.transport.on(
                    cast.framework.CastContextEventType.CAST_STATE_CHANGED,
                    onCastStateChange
                );
            }
        };
        const onCoreEvent = (name) => {
            if (name === 'PlayingOnDevice') {
                playingOnExternalDevice.current = true;
                onPauseRequested();
            }
        };
        services.chromecast.on('stateChanged', onChromecastServiceStateChange);
        core.on('event', onCoreEvent);
        onChromecastServiceStateChange();
        return () => {
            toast.removeFilter(toastFilter);
            services.chromecast.off('stateChanged', onChromecastServiceStateChange);
            core.off('event', onCoreEvent);
            if (services.chromecast.active) {
                services.chromecast.transport.off(
                    cast.framework.CastContextEventType.CAST_STATE_CHANGED,
                    onCastStateChange
                );
            }
        };
    }, []);

    React.useEffect(() => {
        if (settings.pauseOnMinimize && (platform.shell.state.windowClosed || platform.shell.state.windowHidden)) {
            onPauseRequested();
        }
    }, [settings.pauseOnMinimize, platform.shell.state.windowClosed, platform.shell.state.windowHidden]);

    React.useEffect(() => {
        if (video.state.stream === null || typeof player?.title !== 'string') {
            discordTimestamps.current = EMPTY_DISCORD_TIMESTAMPS;
            discord.setActivity(null);
            return;
        }

        const metaItem = player.metaItem?.type === 'Ready' ? player.metaItem.content : null;
        const { activity, timestamps } = getPlaybackDiscordActivity({
            title: player.title,
            image: metaItem?.poster || metaItem?.background || null,
            paused: video.state.paused,
            time: video.state.time,
            duration: video.state.duration,
            timestamps: discordTimestamps.current,
        });

        discordTimestamps.current = timestamps;
        discord.setActivity(activity);
    }, [discord.setActivity, player?.title, player.metaItem, video.state.duration, video.state.paused, video.state.stream, video.state.time]);

    React.useEffect(() => {
        return () => {
            discord.setActivity(null);
        };
    }, [discord.setActivity]);

    useMediaSession(video.state, player, fullscreen, onPlayRequested, onPauseRequested, onNextVideoRequested);

    React.useEffect(() => {
        const onMediaKey = (action) => {
            switch (action) {
                case 'play-pause':
                    if (video.state.paused !== null) {
                        video.state.paused ? onPlayRequested() : onPauseRequested();
                    }
                    break;
                case 'play':
                    onPlayRequested();
                    break;
                case 'pause':
                    onPauseRequested();
                    break;
                case 'next-track':
                    if (player.nextVideo !== null) {
                        video.setTime(0);
                        onNextVideoRequested();
                    }
                    break;
            }
        };
        platform.shell.on('media-key', onMediaKey);
        return () => platform.shell.off('media-key', onMediaKey);
    }, [video.state.paused, player.nextVideo, onPlayRequested, onPauseRequested, onNextVideoRequested]);

    // TV fork: i tasti Prev/Next del telecomando arrivano via MPRIS ->
    // navigator.mediaSession come nexttrack/previoustrack. L'utente li vuole
    // come seek +/- N (UX TV), NON come prev/next episodio: mappare nexttrack
    // a onNextVideoRequested faceva uscire alla streams list al primo
    // "fast-forward". Il salto-episodio resta su Shift+N + bottone.
    // Gira DOPO useMediaSession (registrato sopra) e, con dep su
    // video.state.time / player.nextVideo, si ri-applica sovrascrivendo il
    // nexttrack->nextVideo che useMediaSession imposta.
    React.useEffect(() => {
        if (!navigator.mediaSession) return;
        const seekForward = () => {
            if (video.state.time === null) return;
            setSeeking(true);
            onSeekRequested(video.state.time + settings.seekTimeDuration);
        };
        const seekBackward = () => {
            if (video.state.time === null) return;
            setSeeking(true);
            onSeekRequested(video.state.time - settings.seekTimeDuration);
        };
        navigator.mediaSession.setActionHandler('nexttrack', seekForward);
        navigator.mediaSession.setActionHandler('previoustrack', seekBackward);
        navigator.mediaSession.setActionHandler('seekforward', seekForward);
        navigator.mediaSession.setActionHandler('seekbackward', seekBackward);
    }, [video.state.time, player.nextVideo, onSeekRequested, settings.seekTimeDuration]);

    onShortcut('seekForward', (combo) => {
        if (video.state.time !== null) {
            const seekDuration = combo === 1 ? settings.seekShortTimeDuration : settings.seekTimeDuration;
            setSeeking(true);
            onSeekRequested(video.state.time + seekDuration);
        }
    }, [video.state.time, onSeekRequested], !menusOpen && tvNavMode !== 'buttons');

    onShortcut('seekBackward', (combo) => {
        if (video.state.time !== null) {
            const seekDuration = combo === 1 ? settings.seekShortTimeDuration : settings.seekTimeDuration;
            setSeeking(true);
            onSeekRequested(video.state.time - seekDuration);
        }
    }, [video.state.time, onSeekRequested], !menusOpen && tvNavMode !== 'buttons');

    onShortcut('mute', () => {
        video.state.muted === true ? onUnmuteRequested() : onMuteRequested();
    }, [video.state.muted], !menusOpen);

    // Subtitles shortcuts (delay/size/toggle/menu) ora vivono in useSubtitles.
    // La nostra custom "subtitlesMenu apre sempre, anche senza tracks" e'
    // riportata li' (rimosso il gate hasTracks). Niente inline qui per non
    // doppio-registrare (useSubtitles e' chiamato sopra).
    onShortcut('volume', (combo) => {
        if (video.state.volume !== null) {
            const volume = combo === 0 ? Math.min(video.state.volume + 5, 200) : Math.max(video.state.volume - 5, 0);
            onVolumeChangeRequested(volume);
        }
    }, [video.state.volume], !menusOpen);

    onShortcut('audioMenu', () => {
        closeMenus();
        if (video.state?.audioTracks?.length > 0) {
            toggleAudioMenu();
        }
    }, [video.state.audioTracks, toggleAudioMenu]);

    onShortcut('infoMenu', () => {
        closeMenus();
        if (player.metaItem?.type === 'Ready') {
            toggleSideDrawer();
        }
    }, [player.metaItem, toggleSideDrawer]);

    onShortcut('speedMenu', () => {
        closeMenus();
        if (video.state.playbackSpeed !== null) {
            toggleSpeedMenu();
        }
    }, [video.state.playbackSpeed, toggleSpeedMenu]);

    onShortcut('speed', (combo) => {
        if (video.state.playbackSpeed !== null) {
            const speed = combo === 0 ? Math.max(video.state.playbackSpeed - 0.25, 0.25) : Math.min(video.state.playbackSpeed + 0.25, 2);
            onPlaybackSpeedChanged(speed);
        }
    }, [video.state.playbackSpeed, onPlaybackSpeedChanged], !menusOpen);

    // Casa: il gate e' `statistics.infoHash` (lo espone useStatistics, che lo ricava
    // dall'url /ts per i nostri stream TorrServer e da stream.infoHash per i torrent
    // classici). Era ancorato a stream.infoHash+fileIdx = campi che i nostri stream
    // HTTP non hanno -> da TorrServer in poi le stats erano sempre irraggiungibili,
    // pur essendo gia' calcolate.
    onShortcut('statisticsMenu', () => {
        closeMenus();
        if (typeof statistics?.infoHash === 'string') {
            toggleStatisticsMenu();
        }
    }, [statistics, toggleStatisticsMenu]);

    // Auto-apri il popup statistics 5s dopo lo start dello stream. L'utente
    // lo aprirebbe manualmente per monitorare peers/speed durante il loading;
    // ce lo facciamo da soli. Riarmato a ogni cambio stream
    // (infoHash+fileIdx); idempotente se gia' aperto.
    const streamingStatsRef = React.useRef(streamingServer.statistics);
    React.useEffect(() => { streamingStatsRef.current = streamingServer.statistics; }, [streamingServer.statistics]);
    const selectedStream = player.selected?.stream;
    // TorrServer: i nostri url stream (/ts/<hash>/<idx>) non hanno infoHash/fileIdx
    // nativi -> li deriviamo dall'url, cosi' l'auto-apertura delle stats a 5s (sotto)
    // e la memoria "ultimo stream" funzionano come per i torrent classici.
    const tsSel = typeof selectedStream?.url === 'string' ? selectedStream.url.match(/\/ts\/([a-f0-9]{40})\/(-?\d+)/i) : null;
    const streamInfoHash = typeof selectedStream?.infoHash === 'string' ? selectedStream.infoHash : (tsSel ? tsSel[1].toLowerCase() : null);
    const streamFileIdx = typeof selectedStream?.fileIdx === 'number' ? selectedStream.fileIdx : (tsSel ? 0 : null);
    // Barra di progresso: per i nostri stream TorrServer (/ts) mostra anche la
    // finestra scaricata. La Slider vuole `buffered` = posizione ASSOLUTA fin dove
    // e' bufferizzato -> time + (completed% * durata), con completed% =
    // preloaded/size (~secondi di finestra davanti alla testina). Cosi' il
    // "riempito" della barra arriva qualche minuto oltre il punto corrente.
    // Fuori da TorrServer resta il buffered del browser (MSE). max() per non
    // mostrare mai MENO di quanto il browser ha davvero; clamp alla durata.
    const seekBarBuffered = (() => {
        const browserBuffered = typeof video.state.buffered === 'number' ? video.state.buffered : 0;
        if (tsSel && statistics && typeof statistics.completed === 'number' &&
            typeof video.state.time === 'number' && typeof video.state.duration === 'number' && video.state.duration > 0) {
            const windowSec = (statistics.completed / 100) * video.state.duration;
            return Math.min(video.state.duration, Math.max(browserBuffered, video.state.time + windowSec));
        }
        return video.state.buffered;
    })();
    // Ricorda quale stream stai guardando per questo video: al ritorno nella
    // lista torrent StreamsList ci preseleziona la card corrispondente.
    React.useEffect(() => {
        rememberStream(selectedStream); // memoria globale per infoHash, non legata al videoId
    }, [streamInfoHash, streamFileIdx, selectedStream?.url, selectedStream?.ytId]);
    // Una volta sola per stream: appena la riproduzione PARTE davvero
    // (buffer completo: paused===false && buffering===false) chiudiamo le
    // stats auto-aperte, senza costringere l'utente al tasto indietro.
    // Il flag evita anche che il timer dei 5s le riapra se lo start e' rapido,
    // e che una ri-bufferizzazione a meta' film le faccia ricomparire.
    const autoStatsHandledRef = React.useRef(false);
    React.useEffect(() => {
        autoStatsHandledRef.current = false;
    }, [streamInfoHash, streamFileIdx]);
    React.useEffect(() => {
        if (streamInfoHash === null || streamFileIdx === null) return;
        const tid = setTimeout(() => {
            if (streamingStatsRef.current?.type === 'Err') return;
            if (autoStatsHandledRef.current) return;
            openStatisticsMenu();
        }, 5000);
        return () => clearTimeout(tid);
    }, [streamInfoHash, streamFileIdx, openStatisticsMenu]);
    React.useEffect(() => {
        if (autoStatsHandledRef.current) return;
        if (streamInfoHash === null || streamFileIdx === null) return;
        // paused===false (sta riproducendo) + !buffering (buffer pieno; copre
        // sia false che il null "non sto bufferizzando" emesso da alcune
        // implementazioni video).
        if (video.state.paused === false && !video.state.buffering) {
            autoStatsHandledRef.current = true;
            closeStatisticsMenu();
        }
    }, [video.state.paused, video.state.buffering, streamInfoHash, streamFileIdx, closeStatisticsMenu]);

    onShortcut('playNext', () => {
        closeMenus();
        if (player.nextVideo !== null) {
            nextVideo();
            const deepLinks = player.nextVideo.deepLinks;
            handleNextVideoNavigation(deepLinks, false, false);
        }
    }, [player.nextVideo, handleNextVideoNavigation]);

    onShortcut('exit', () => {
        // Esc gerarchico: dismiss del piu' interno prima di tornare indietro.
        // Ogni "indietro" toglie un livello di UI visibile; solo quando lo
        // schermo e' pulito (video immersivo, barra nascosta) esce dal film.
        // 1) Un menu aperto -> chiudi solo il menu.
        // 2) Video in PAUSA -> riprendi (nasconde barra + popup stats).
        // 3) TV nav (seekbar/buttons) -> esci dalla nav e nascondi la barra.
        // 4) Barra visibile a video in play (immersed=false) -> nascondila.
        // 5) Video pulito -> window.history.back() (torna alla lista torrent).
        //    back() raw (non navigate(-1)) perche' l'ingresso via Continue
        //    Watching semina la history con window.history.pushState: back()
        //    opera sul browser-history reale, navigate(-1) sull'indice interno
        //    di react-router che non vede i pushState raw.
        if (menusOpen) {
            closeMenus();
            return;
        }
        // In pausa, barra e popup Statistics restano su per design
        // (paused===true forza overlayHidden=false; il popup e' reso da
        // `statisticsMenuOpen || paused===true` -> NON entra in menusOpen).
        // "Indietro" qui RIPRENDE la riproduzione e nasconde tutto in un
        // colpo, invece di uscire dal film: e' l'azione naturale su TV
        // ("torno a guardare"). Per uscire: "indietro" da video in play.
        if (video.state.paused === true) {
            onPlayRequested();
            setTvNavMode(null);
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
            setImmersedDebounced.cancel();
            setImmersed(true);
            return;
        }
        if (tvNavMode !== null) {
            setTvNavMode(null);
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
            // Uscendo dalla nav a video in play, ri-immergi: la barra sparisce
            // subito invece di restare su (immersed poteva essere false).
            setImmersedDebounced.cancel();
            setImmersed(true);
            return;
        }
        // Video in play ma barra ancora visibile (immersed=false, es. dopo un
        // movimento di mouse/telecomando): "indietro" la NASCONDE invece di
        // uscire. Solo col video gia' pulito il prossimo "indietro" esce.
        // Uso !immersed (non !overlayHidden) per non intrappolare il caso
        // casting, dove la barra resta comunque su e serve poter uscire.
        if (!immersed) {
            setImmersedDebounced.cancel();
            setImmersed(true);
            return;
        }
        // TV kiosk: B torna SEMPRE indietro. Niente guard escExitFullscreen
        // (default Stremio = true): siamo sempre WM-fullscreen, l'exit
        // dell'API Fullscreen e' irrilevante e bloccava il back. Prima del
        // merge questo lo faceva il vecchio service KeyboardShortcuts (Esc ->
        // history.back senza guard), ora cancellato da upstream.
        window.history.back();
    }, [tvNavMode, menusOpen, closeMenus, video.state.paused, onPlayRequested, immersed]);

    React.useLayoutEffect(() => {
        if (menusOpen) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
            longPress.current = false;
        }

        const focusableButtons = () => {
            const root = controlBarRef.current;
            if (!root) return [];
            return [...root.querySelectorAll('[data-tv-button]')]
                .filter((b) => !b.classList.contains('disabled'));
        };

        // === TV nav (capture phase) ===
        // La spatial-navigation-polyfill di Stremio (App.js:3) intercetta
        // ↑↓←→ su window e sposta il focus al primo focusable nella
        // direzione. Senza capture+stopImmediatePropagation, premere ↓ dal
        // video metteva focus su play/pause (polyfill) E settava
        // tvNavMode='seekbar' (mio handler) -> doppio outline visibile.
        const onTvNavKeyDownCapture = (e) => {
            if (menusOpen) return; // delego al menu nav

            const mode = tvNavModeRef.current;
            if (e.code === 'ArrowDown') {
                if (mode === null) {
                    setTvNavMode('seekbar');
                } else if (mode === 'seekbar') {
                    setTvNavMode('buttons');
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        const btns = focusableButtons();
                        if (btns.length > 0) btns[0].focus();
                    }));
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
            }
            if (e.code === 'ArrowUp') {
                if (mode === 'buttons') {
                    setTvNavMode('seekbar');
                    if (document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                    }
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
                if (mode === 'seekbar') {
                    setTvNavMode(null);
                    e.preventDefault();
                    e.stopImmediatePropagation();
                }
                return;
            }
            if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && mode === 'buttons') {
                const btns = focusableButtons();
                if (btns.length === 0) return;
                const idx = btns.indexOf(document.activeElement);
                // Focus perso (es. menu chiuso): riporta sul primo bottone.
                const next = idx < 0
                    ? 0
                    : e.code === 'ArrowRight'
                        ? Math.min(btns.length - 1, idx + 1)
                        : Math.max(0, idx - 1);
                btns[next].focus();
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
            }
        };

        const onKeyDown = (e) => {
            if (menusOpen) return;

            // Enter = play/pause toggle, ma solo se NON sono su un bottone:
            // li' Button.tsx gestisce nativamente Enter -> click().
            if (e.code === 'Enter' && !e.repeat && tvNavModeRef.current !== 'buttons' && video.state.paused !== null) {
                if (video.state.paused) {
                    onPlayRequested();
                    setSeeking(false);
                } else {
                    onPauseRequested();
                }
                e.preventDefault();
                return;
            }

            // Space long-press = playback 2x.
            if (e.code !== 'Space' || e.repeat) return;

            longPress.current = false;

            pressTimer.current = setTimeout(() => {
                longPress.current = true;
                onPlaybackSpeedChanged(2, true);
            }, HOLD_DELAY);
        };

        const onKeyUp = (e) => {
            if (e.code !== 'Space' && e.code !== 'ArrowRight' && e.code !== 'ArrowLeft') return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
                setSeeking(false);
                return;
            }
            if (e.code === 'Space') {
                clearTimeout(pressTimer.current);
                pressTimer.current = null;
                if (longPress.current) {
                    onPlaybackSpeedChanged(playbackSpeed.current);
                } else if (!menusOpen && video.state.paused !== null) {
                    if (video.state.paused) {
                        onPlayRequested();
                        setSeeking(false);
                    } else {
                        onPauseRequested();
                    }
                }
                longPress.current = false;
            }
        };

        const onWheel = ({ deltaY }) => {
            if (menusOpen || video.state.volume === null) return;

            if (deltaY > 0) {
                onVolumeChangeRequested(Math.max(video.state.volume - 5, 0));
            } else {
                if (video.state.volume < 100) {
                    onVolumeChangeRequested(Math.min(video.state.volume + 5, 100));
                }
            }
        };

        const onMouseDownHold = (e) => {
            if (e.button !== 0) return; // left mouse button only
            if (menusOpen) return;
            if (controlBarRef.current && controlBarRef.current.contains(e.target)) return;

            longPress.current = false;

            pressTimer.current = setTimeout(() => {
                longPress.current = true;
                onPlaybackSpeedChanged(2, true);
            }, HOLD_DELAY);
        };

        const onMouseUp = (e) => {
            if (e.button !== 0) return;

            clearTimeout(pressTimer.current);

            if (longPress.current) {
                onPlaybackSpeedChanged(playbackSpeed.current);
            }
        };

        const onBlur = () => {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
            if (longPress.current) {
                onPlaybackSpeedChanged(playbackSpeed.current);
                longPress.current = false;
            }
            setSeeking(false);
        };

        // CAPTURE phase: intercetta Esc PRIMA del service KeyboardShortcuts
        // globale (services/KeyboardShortcuts/KeyboardShortcuts.js) che, se
        // non vede una `.modals-container` aperta, fa history.back(). I
        // menu del Player (SubtitlesMenu, AudioMenu, ...) sono layer custom
        // — non sono modal-container — quindi senza questo flag Esc su
        // menu aperto torna alla lista torrent invece di chiudere il menu.
        const onKeyDownCapture = (e) => {
            if (e.key !== 'Escape') return;
            if (menusOpen || tvNavModeRef.current !== null) {
                e.keyboardShortcutPrevented = true;
            }
        };

        if (routeFocused) {
            window.addEventListener('keydown', onTvNavKeyDownCapture, true);
            window.addEventListener('keydown', onKeyDownCapture, true);
            window.addEventListener('keyup', onKeyUp);
            window.addEventListener('keydown', onKeyDown);
            window.addEventListener('wheel', onWheel);
            window.addEventListener('mousedown', onMouseDownHold);
            window.addEventListener('mouseup', onMouseUp);
            window.addEventListener('blur', onBlur);
        }
        return () => {
            window.removeEventListener('keydown', onTvNavKeyDownCapture, true);
            window.removeEventListener('keydown', onKeyDownCapture, true);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('wheel', onWheel);
            window.removeEventListener('mousedown', onMouseDownHold);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('blur', onBlur);
        };
    }, [routeFocused, menusOpen, video.state.volume, video.state.paused]);

    React.useEffect(() => {
        video.events.on('error', onError);
        video.events.on('ended', onEnded);

        return () => {
            video.events.off('error', onError);
            video.events.off('ended', onEnded);
        };
    }, [onEnded]);

    React.useLayoutEffect(() => {
        return () => {
            setImmersedDebounced.cancel();
            onPlayRequestedDebounced.cancel();
            onPauseRequestedDebounced.cancel();
        };
    }, []);

    return (
        <div ref={playerRef} className={classnames(styles['player-container'], { [styles['overlayHidden']]: overlayHidden })}
            onMouseDown={onContainerMouseDown}
            onMouseMove={onContainerMouseMove}
            onMouseOver={onContainerMouseMove}
            onMouseLeave={onContainerMouseLeave}>
            <Video
                ref={video.containerRef}
                className={styles['layer']}
                onClick={onVideoClick}
                onDoubleClick={onVideoDoubleClick}
            />
            {
                !video.state.loaded ?
                    <div className={classnames(styles['layer'], styles['background-layer'])}>
                        <img className={styles['image']} src={player?.metaItem?.content?.background} />
                    </div>
                    :
                    null
            }
            {
                (video.state.buffering || !video.state.loaded) && !error ?
                    <Buffering
                        ref={bufferingRef}
                        className={classnames(styles['layer'], styles['buffering-layer'])}
                        logo={player?.metaItem?.content?.logo}
                        progress={statistics.progress}
                    />
                    :
                    null
            }
            {
                error !== null ?
                    <Error
                        ref={errorRef}
                        className={classnames(styles['layer'], styles['error-layer'])}
                        stream={video.state.stream}
                        {...error}
                    />
                    :
                    null
            }
            {
                menusOpen ?
                    <div className={styles['layer']} />
                    :
                    null
            }
            {
                video.state.volume !== null && overlayHidden ?
                    <VolumeChangeIndicator
                        muted={video.state.muted}
                        volume={video.state.volume}
                    />
                    :
                    null
            }
            <ContextMenu on={[video.containerRef, bufferingRef, errorRef]} autoClose>
                <OptionsMenu
                    className={classnames(styles['layer'], styles['menu-layer'])}
                    stream={player?.selected?.stream}
                    playbackDevices={playbackDevices}
                    extraSubtitlesTracks={extraSubtitleTracks}
                    selectedExtraSubtitlesTrackId={selectedExtraSubtitleTrackId}
                />
            </ContextMenu>
            <HorizontalNavBar
                className={classnames(styles['layer'], styles['nav-bar-layer'])}
                title={player.title !== null ? player.title : ''}
                backButton={true}
                // TV: niente fullscreen button — il kiosk e' gia' sempre
                // fullscreen, il bottone e' un'azione inutile (e in pausa
                // restava visibile in alto a destra).
                fullscreenButton={false}
                hdrInfo={video.state.hdrInfo}
                onMouseMove={onBarMouseMove}
                onMouseOver={onBarMouseMove}
            />
            {/* TV: SideDrawerButton (grossa freccia a destra che apriva il
                drawer episodi/stream) rimosso — azione non usata da divano,
                disturbava in pausa. Il drawer resta nel codice ma non e' piu'
                raggiungibile da qui. */}
            <ControlBar
                ref={controlBarRef}
                tvNavMode={tvNavMode}
                className={classnames(styles['layer'], styles['control-bar-layer'])}
                paused={video.state.paused}
                time={video.state.time}
                duration={video.state.duration}
                buffered={seekBarBuffered}
                subtitlesTracks={allSubtitleTracks}
                audioTracks={video.state.audioTracks}
                nextVideo={player.nextVideo}
                stream={player.selected !== null ? player.selected.stream : null}
                statistics={statistics}
                onPlayRequested={onPlayRequested}
                onPauseRequested={onPauseRequested}
                onNextVideoRequested={onNextVideoRequested}
                onSeekRequested={onSeekRequested}
                onToggleSubtitlesMenu={toggleSubtitlesMenu}
                onToggleAudioMenu={toggleAudioMenu}
                onToggleStatisticsMenu={toggleStatisticsMenu}
                onMouseMove={onBarMouseMove}
                onMouseOver={onBarMouseMove}
                onTouchEnd={onContainerMouseLeave}
            />
            <Indicator
                className={classnames(styles['layer'], styles['indicator-layer'])}
                videoState={video.state}
                disabled={subtitlesMenuOpen}
            />
            {
                nextVideoPopupOpen ?
                    <NextVideoPopup
                        className={classnames(styles['layer'], styles['menu-layer'])}
                        metaItem={player.metaItem !== null && player.metaItem.type === 'Ready' ? player.metaItem.content : null}
                        nextVideo={player.nextVideo}
                        onDismiss={onDismissNextVideoPopup}
                        onNextVideoRequested={onNextVideoRequested}
                    />
                    :
                    null
            }
            {/* TV: stats visibili anche a video fermo (paused) — senza usare
                openStatisticsMenu (che entrerebbe in menusOpen e bloccherebbe
                il seek ←/→). Cosi' in pausa vedi peers/speed/buffer ma puoi
                ancora cercare. */}
            <Transition when={statisticsMenuOpen || video.state.paused === true} name={'fade'}>
                <StatisticsMenu
                    className={classnames(styles['layer'], styles['menu-layer'], styles['statistics-layer'])}
                    {...statistics}
                    buffer={statistics && typeof statistics.completed === 'number' && video.state.duration !== null ? (statistics.completed / 100) * video.state.duration : null}
                />
            </Transition>
            <Transition when={sideDrawerOpen} name={'slide-left'}>
                <SideDrawer
                    className={classnames(styles['layer'], styles['side-drawer-layer'])}
                    metaItem={player.metaItem?.content}
                    seriesInfo={player.seriesInfo}
                    closeSideDrawer={closeSideDrawer}
                    selected={player.selected?.streamRequest?.path?.id}
                />
            </Transition>
            <Transition when={subtitlesMenuOpen} name={'fade'}>
                <SubtitlesMenu
                    className={classnames(styles['layer'], styles['menu-layer'])}
                    {...subtitlesMenuProps}
                />
            </Transition>
            <Transition when={audioMenuOpen} name={'fade'}>
                <AudioMenu
                    className={classnames(styles['layer'], styles['menu-layer'])}
                    audioTracks={video.state.audioTracks}
                    selectedAudioTrackId={video.state.selectedAudioTrackId}
                    onAudioTrackSelected={onAudioTrackSelected}
                />
            </Transition>
            <Transition when={speedMenuOpen} name={'fade'}>
                <SpeedMenu
                    className={classnames(styles['layer'], styles['menu-layer'])}
                    playbackSpeed={video.state.playbackSpeed}
                    onPlaybackSpeedChanged={onPlaybackSpeedChanged}
                />
            </Transition>
            <Transition when={optionsMenuOpen} name={'fade'}>
                <OptionsMenu
                    className={classnames(styles['layer'], styles['menu-layer'])}
                    stream={player.selected?.stream}
                    playbackDevices={playbackDevices}
                    extraSubtitlesTracks={extraSubtitleTracks}
                    selectedExtraSubtitlesTrackId={selectedExtraSubtitleTrackId}
                />
            </Transition>
        </div>
    );
};

const PlayerFallback = () => (
    <div className={classnames(styles['player-container'])} />
);

module.exports = withCoreSuspender(Player, PlayerFallback);
