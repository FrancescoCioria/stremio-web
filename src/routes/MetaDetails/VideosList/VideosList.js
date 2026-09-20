// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { t } = require('i18next');
const { useCore } = require('stremio/core');
const { useProfile } = require('stremio/common');
const { Image, SearchBar, Video } = require('stremio/components');
const { mergeCasaExtraVideos } = require('stremio/common/casaExtraVideos');
const { pickSeason, pickFocusVideo } = require('stremio/common/casaEpisodeFocus');
const { casaBeacon } = require('stremio/common/casaBackend');
const { revealCardInRail } = require('stremio/common/casaRailNav');
const useCasaExtraVideos = require('stremio/routes/MetaDetails/useCasaExtraVideos');
const SeasonsBar = require('./SeasonsBar');
const { default: EpisodePicker } = require('../EpisodePicker');
const styles = require('./styles');

// Il deep link agli stream del core NON porta `?season=`. Senza, tra l'Enter
// sulla card e la risposta del core (async) questa lista resta montata per un
// frame con season=null -> ricade sulla stagione del library item (ultimo
// episodio visto) -> l'auto-focus salta su QUEL episodio e il MetaPreview mostra
// S19E13 mentre l'URL (e gli stream) sono di S20E01. Con la stagione nell'URL
// la lista non cambia stagione e il Back dagli stream torna dove si era.
const withSeason = (deepLinks, season) => {
    if (!deepLinks || typeof deepLinks.metaDetailsStreams !== 'string' || typeof season !== 'number') {
        return deepLinks;
    }
    const link = deepLinks.metaDetailsStreams;
    if (link.includes('?')) return deepLinks;
    return { ...deepLinks, metaDetailsStreams: `${link}?season=${season}` };
};

// Scroll position della lista episodi, preservata tra un click su un episodio
// e il ritorno alla lista (bugfix upstream: keep scroll position).
let savedScrollTop = 0;

const VideosList = ({ className, metaItem, libraryItem, season, seasonOnSelect, selectedVideoId, onFocusedVideoChange }) => {
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
    // Allo smontaggio (la pagina passa agli stream) il focus non e' piu' su
    // nessun episodio: senza questo reset il MetaPreview restava sull'ULTIMO
    // episodio focussato — e per via del re-render transitorio senza
    // `?season` (vedi withSeason) quello era l'ultimo VISTO (S19E13), non
    // quello scelto (S20E01). Bug X Factor 2026-09-11.
    const onFocusedVideoChangeRef = React.useRef(onFocusedVideoChange);
    onFocusedVideoChangeRef.current = onFocusedVideoChange;
    React.useEffect(() => () => {
        if (typeof onFocusedVideoChangeRef.current === 'function') {
            onFocusedVideoChangeRef.current(null);
        }
    }, []);
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
    // Letto dal keydown handler (useCallback senza deps) per trovare la pill
    // della stagione corrente senza ricreare l'handler a ogni cambio.
    const selectedSeasonRef = React.useRef(null);

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
            // La pill della stagione ATTIVA, non la prima. Le pill filtrano al
            // focus: atterrare sulla prima (S1) cambiava stagione sotto i
            // piedi, e su una serie con 20 stagioni tornare a quella giusta
            // costava 19 pressioni (X Factor, 2026-09-11).
            const bar = content.querySelector('[class*="seasons-bar-container"]');
            if (!bar) return;
            // ⚠️ Le pill NON sono <button> (il Button del kit rende un div/a):
            // il selettore va per data-attribute, senza tag.
            const seasonPill = bar.querySelector(`[data-season="${selectedSeasonRef.current}"]`) ||
                bar.querySelector('[class*="season-pill"]');
            if (!seasonPill) return;
            e.preventDefault();
            e.stopPropagation();
            seasonPill.focus({ preventScroll: true });
            seasonPill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            return;
        }
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const container = videosContainerRef.current;
        if (!container) return;
        const current = e.target.closest('[data-video-id]');
        if (!current) return;
        const target = e.key === 'ArrowRight' ? current.nextElementSibling : current.previousElementSibling;
        // ⚠️ Da qui l'evento va CONSUMATO in OGNI uscita, anche quando non c'e'
        // dove andare: il bordo della lista e' un muro. Senza, le frecce di
        // troppo (tenere premuto arriva sempre oltre il primo episodio) finivano
        // allo scroll nativo del browser, e uno scroll dell'utente ANNULLA lo
        // smooth scroll in corso — quello che stava riportando il rail a inizio
        // stagione. Misurato il 2026-09-20 su 8 pressioni a 40ms: il rail si
        // fermava a 941px invece di 0 e ci restava. E' il "tornare al primo
        // funzionava male" riportato dal campo, e Board.js aveva gia' questa
        // regola (la copia locale no).
        e.preventDefault();
        e.stopPropagation();
        if (!target || !target.dataset || !target.dataset.videoId) return;
        const focusable = target.querySelector('[tabindex], a, button') || target;
        focusable.focus({ preventScroll: true });
        // Reveal-if-needed, non ri-centrare: il re-center a ogni freccia faceva
        // balzare il rail avanti e indietro e rendeva melassa il ritorno al
        // primo episodio (Board.js l'aveva gia' buttato via anni fa).
        revealCardInRail(container, target, e.key === 'ArrowRight' ? 1 : -1);
    }, []);

    // Casa: episodi che esistono ma che Cinemeta non elenca (X Factor 2026-09-18:
    // la lista si fermava a E01 e la puntata del 17 non era cliccabile).
    // Il merge de-duplica contro il meta vero -> appena il core li elenca,
    // i nostri spariscono. Vedi common/casaExtraVideos.js.
    const metaReady = metaItem && metaItem.content.type === 'Ready' ? metaItem.content.content : null;
    const casaExtra = useCasaExtraVideos(metaReady ? metaReady.type : null, metaReady ? metaReady.id : null);
    const videos = React.useMemo(() => {
        return mergeCasaExtraVideos(metaReady ? metaReady.videos : [], casaExtra, metaReady ? metaReady.id : null, metaReady ? metaReady.background : null);
    }, [metaReady, casaExtra]);
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
    // Casa: la stagione di ripresa e' un vicolo cieco quando l'hai finita —
    // si scavalca alla prima con qualcosa da vedere. Regola e misura in
    // common/casaEpisodeFocus.js.
    const seasonDecision = React.useMemo(() => {
        return pickSeason({
            seasons,
            seasonFromUrl: season,
            videos,
            resumeVideoId: libraryItem?.state?.video_id,
        });
    }, [seasons, season, videos, libraryItem]);
    const selectedSeason = seasonDecision.season;
    // Il salto e' raro: senza un evento non si saprebbe mai se ha ingaggiato.
    const jumpLoggedRef = React.useRef(null);
    React.useEffect(() => {
        if (seasonDecision.reason !== 'resume-season-finished') return;
        const key = `${metaReady?.id}:${selectedSeason}`;
        if (jumpLoggedRef.current === key) return;
        jumpLoggedRef.current = key;
        casaBeacon('/debug/player-event', {
            ev: 'casa-season-jump',
            meta_id: metaReady?.id ?? null,
            from: libraryItem?.state?.video_id ?? null,
            to_season: selectedSeason,
        });
    }, [seasonDecision, selectedSeason, metaReady, libraryItem]);
    selectedSeasonRef.current = selectedSeason;
    const videosForSeason = React.useMemo(() => {
        return videos
            .filter((video) => {
                return selectedSeason === null || video.season === selectedSeason;
            })
            .sort((a, b) => {
                return a.episode - b.episode;
            });
    }, [videos, selectedSeason]);

    // Ordine delle priorita' in common/casaEpisodeFocus.js (puro + test):
    // l'episodio davvero aperto per ultimo, poi uno lasciato a meta', poi il
    // PRIMO da vedere. "Ultimo visto" solo su una stagione tutta vista.
    // ⚠️ Marcato anche nel DOM (`data-casa-focus`): la SeasonsBar ci arriva
    // con ArrowDown e non ha modo di ricalcolarlo.
    const focusTarget = React.useMemo(() => {
        return pickFocusVideo(videosForSeason, selectedVideoId);
    }, [videosForSeason, selectedVideoId]);

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
        const target = focusTarget;
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
        // ⚠️ `left`, non `top`: il rail episodi scrolla in ORIZZONTALE
        // (`overflow-y: hidden`), quindi `scrollTo({top:0})` era un no-op sul
        // solo asse che conta. Cambiando stagione dalle pill il rail restava
        // dov'era la stagione precedente — in fondo, se l'avevi finita — e si
        // atterrava sugli ultimi episodi della stagione nuova.
        if (!hasSelectedVideo && videosContainerRef.current) {
            videosContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
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
                                                data-casa-focus={focusTarget && video.id === focusTarget.id ? '1' : undefined}
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
                                                    deepLinks={withSeason(video.deepLinks, selectedSeason)}
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
    onFocusedVideoChange: PropTypes.func,
};

module.exports = VideosList;
