// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { t } = require('i18next');
const { useCore } = require('stremio/core');
const { Image, Video } = require('stremio/components');
const { mergeCasaExtraVideos } = require('stremio/common/casaExtraVideos');
const { pickSeason, pickFocusVideo, holdSeason } = require('stremio/common/casaEpisodeFocus');
const { casaBeacon } = require('stremio/common/casaBackend');
const { revealCardInRail } = require('stremio/common/casaRailNav');
const useCasaExtraVideos = require('stremio/routes/MetaDetails/useCasaExtraVideos');
const { default: EpisodePicker } = require('../EpisodePicker');
const styles = require('./styles');

// Casa, 2026-09-21: UNA RIGA PER STAGIONE, tutte insieme sotto l'hero fisso —
// la stessa forma della home. Prima era una rail sola filtrata da una barra di
// pill, cioe' una MODALITA': quale stagione stai guardando era stato nascosto,
// e da li' usciva una famiglia intera di difetti (la pill che cambiava
// stagione al solo focus, l'auto-focus soppresso mentre scorrevi le pill, lo
// scroll della rail che si trascinava da una stagione all'altra, e su X Factor
// diciannove pressioni per tornare alla stagione giusta).
//
// Misurato prima di scriverlo, al viewport vero della TV (2259x1271 @1.7):
// hero 681px, sotto restano 660px una volta tolte le pill, una riga stagione
// ne occupa ~487 => 1,35 righe visibili. La home ne mostra 1,39 (scroller
// 727px, riga 521px): identico. Anche la home non mostra "tutte le liste" —
// la sensazione la da' la nav, non il vedere tutto insieme.
//
// ⚠️ Niente finestra di rendering sulle righe, deliberato: sulla library vera
// (80 serie) la mediana e' 2 stagioni, il 66% ne ha 1-2 e il 92% ne ha <=5.
// L'unica sopra le 10 e' X Factor (20 stagioni, 255 episodi), cioe' lo stesso
// ordine di grandezza delle ~150 card che la home gia' monta. Complicare per
// un caso su 80, senza una misura che dica che e' lento, e' complessita' morta.

// Il deep link agli stream del core NON porta `?season=`. Aggiungerlo serve al
// RITORNO: la pagina episodi rilegge quel parametro e ritrova la riga da cui
// eri partito invece di ridecidere da capo.
const withSeason = (deepLinks, season) => {
    if (!deepLinks || typeof deepLinks.metaDetailsStreams !== 'string' || typeof season !== 'number') {
        return deepLinks;
    }
    const link = deepLinks.metaDetailsStreams;
    if (link.includes('?')) return deepLinks;
    return { ...deepLinks, metaDetailsStreams: `${link}?season=${season}` };
};

// Scroll verticale della lista, preservato tra l'apertura di un episodio e il
// ritorno. ⚠️ Qui e' `scrollTop` per davvero: lo scroller delle righe e'
// verticale (quello ORIZZONTALE e' la rail dentro ogni riga, e la sua
// posizione la ricompone l'auto-focus).
let savedScrollTop = 0;

const VideosList = ({ className, metaItem, libraryItem, season, selectedVideoId, onSeasonOpened, onFocusedVideoChange }) => {
    const core = useCore();

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
    const scrollerRef = React.useRef(null);
    const [focusedVideoId, setFocusedVideoId] = React.useState(null);
    React.useEffect(() => {
        if (typeof onFocusedVideoChange === 'function') {
            onFocusedVideoChange(focusedVideoId);
        }
    }, [focusedVideoId, onFocusedVideoChange]);
    // Allo smontaggio (la pagina passa agli stream) il focus non e' piu' su
    // nessun episodio: senza questo reset il MetaPreview restava sull'ULTIMO
    // episodio focussato. Bug X Factor 2026-09-11.
    const onFocusedVideoChangeRef = React.useRef(onFocusedVideoChange);
    onFocusedVideoChangeRef.current = onFocusedVideoChange;
    React.useEffect(() => () => {
        if (typeof onFocusedVideoChangeRef.current === 'function') {
            onFocusedVideoChangeRef.current(null);
        }
    }, []);
    const setScrollerRef = React.useCallback((el) => {
        const prev = scrollerRef.current;
        if (prev && prev._casaTvCleanup) prev._casaTvCleanup();
        scrollerRef.current = el;
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

    // Quando l'utente apre un episodio si segna DOVE era: lo scroll verticale
    // in una variabile di modulo, e la stagione nell'URL (replace, quindi
    // diventa la voce di history a cui torna il tasto indietro).
    //
    // ⚠️ La stagione passa dall'URL e non da una variabile: cosi' e' la
    // history a tenerla, e non resta appiccicata al prossimo ingresso da
    // un'altra strada — dove a decidere dev'essere "cosa guardo adesso".
    const onSeasonOpenedRef = React.useRef(onSeasonOpened);
    onSeasonOpenedRef.current = onSeasonOpened;
    const saveScrollPosition = React.useCallback((videoSeason) => {
        savedScrollTop = scrollerRef.current?.scrollTop ?? 0;
        if (typeof videoSeason === 'number' && typeof onSeasonOpenedRef.current === 'function') {
            onSeasonOpenedRef.current(videoSeason);
        }
    }, []);
    React.useLayoutEffect(() => {
        if (savedScrollTop > 0 && scrollerRef.current) {
            scrollerRef.current.scrollTop = savedScrollTop;
            savedScrollTop = 0;
        }
    }, []);

    const metaReady = metaItem && metaItem.content.type === 'Ready' ? metaItem.content.content : null;
    // Casa: episodi che esistono ma che Cinemeta non elenca (X Factor
    // 2026-09-18). Il merge de-duplica contro il meta vero -> appena il core li
    // elenca, i nostri spariscono. Vedi common/casaExtraVideos.js.
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

    // Una riga per stagione, in ordine crescente, con gli Speciali (stagione 0)
    // in fondo — e' l'ordine delle pill di prima, e l'ordine naturale di una
    // serie. L'auto-focus porta comunque sulla riga giusta.
    const seasonRows = React.useMemo(() => {
        return seasons.map((s) => ({
            season: s,
            label: s > 0 ? t('SEASON_NUMBER', { season: s }) : t('SPECIAL'),
            videos: videos
                .filter((video) => video.season === s)
                .sort((a, b) => a.episode - b.episode),
        }));
    }, [seasons, videos]);

    // Su quale riga si atterra. ⚠️ Decisione D'INGRESSO, presa una volta per
    // titolo: `watched` cambia in diretta dal menu della card, e senza il latch
    // marcare un episodio sposterebbe il bersaglio sotto le mani dell'utente.
    // Regola, misura e latch in common/casaEpisodeFocus.js.
    const decidedRef = React.useRef(null);
    const seasonDecision = React.useMemo(() => {
        const metaId = metaReady ? metaReady.id : null;
        const held = holdSeason(decidedRef.current, { metaId, seasons, seasonFromUrl: season });
        if (held) {
            decidedRef.current = held.next;
            return held.decision;
        }
        const decision = pickSeason({
            seasons,
            seasonFromUrl: season,
            videos,
            resumeVideoId: libraryItem?.state?.video_id,
        });
        decidedRef.current = { metaId, season: decision.season };
        return decision;
    }, [seasons, season, videos, libraryItem, metaReady]);
    const focusSeason = seasonDecision.season;

    // Il salto e' raro: senza un evento non si saprebbe mai se ha ingaggiato.
    const jumpLoggedRef = React.useRef(null);
    React.useEffect(() => {
        if (seasonDecision.reason !== 'resume-season-finished') return;
        const key = `${metaReady?.id}:${focusSeason}`;
        if (jumpLoggedRef.current === key) return;
        jumpLoggedRef.current = key;
        casaBeacon('/debug/player-event', {
            ev: 'casa-season-jump',
            meta_id: metaReady?.id ?? null,
            from: libraryItem?.state?.video_id ?? null,
            to_season: focusSeason,
        });
    }, [seasonDecision, focusSeason, metaReady, libraryItem]);

    // L'episodio d'ingresso dentro la riga scelta. Marcato anche nel DOM
    // (`data-casa-focus`) cosi' chi arriva da fuori sa dove scendere.
    const focusTarget = React.useMemo(() => {
        const row = seasonRows.find((r) => r.season === focusSeason);
        return row ? pickFocusVideo(row.videos, selectedVideoId) : null;
    }, [seasonRows, focusSeason, selectedVideoId]);

    // Memoria dell'ultima card per riga: passando da riga A card 5 a riga B e
    // tornando su, il focus torna su A card 5 e non su A card 0 (che sarebbe
    // fuori schermo, con "niente di selezionato" a vedersi). WeakMap con key
    // l'elemento riga: se la riga remonta, la entry decade da sola.
    const lastCardByRowRef = React.useRef(new WeakMap());

    // Nav da telecomando, stessa forma di Board.js (onBoardKeyDown).
    const onKeyDown = React.useCallback((e) => {
        const isVertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
        const isHorizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
        if (!isVertical && !isHorizontal) return;
        const root = scrollerRef.current;
        if (!root) return;
        const currentRow = e.target.closest('[data-season-row]');
        if (!currentRow) return;

        if (isVertical) {
            // ⚠️ I verticali si consumano SEMPRE, anche quando non c'e' dove
            // andare: se no lo spatial-navigation polyfill (keydown su window,
            // attivo solo con !defaultPrevented) porta il focus fuori dalla
            // lista e la pagina scrolla da sola.
            e.preventDefault();
            e.stopPropagation();
            const rows = [...root.querySelectorAll('[data-season-row]')];
            const idx = rows.indexOf(currentRow);
            const target = e.key === 'ArrowDown' ? rows[idx + 1] : rows[idx - 1];
            if (!target) {
                // Sopra la prima riga c'e' l'hero: li' vivono Trailer,
                // "Aggiungi alla libreria" e le notifiche, che senza questa
                // uscita sarebbero irraggiungibili (prima ci si passava dalle
                // pill). Sotto l'ultima riga non c'e' niente: si resta.
                if (e.key === 'ArrowUp') {
                    const content = root.closest('[class*="metadetails-content"]');
                    const action = content?.querySelector('[class*="action-buttons-container"] [tabindex], [class*="action-buttons-container"] a, [class*="action-buttons-container"] button');
                    if (action) action.focus({ preventScroll: true });
                }
                return;
            }
            const remembered = lastCardByRowRef.current.get(target);
            const alive = remembered && target.contains(remembered) ? remembered : null;
            const focusTargetEl = alive || target.querySelector('[data-video-id]');
            if (!focusTargetEl) return;
            const focusable = focusTargetEl.querySelector('[tabindex], a, button') || focusTargetEl;
            focusable.focus({ preventScroll: true });
            lastCardByRowRef.current.set(target, focusTargetEl);
            // block:'start' allinea il TITOLO della riga col bordo alto dello
            // scroller (meno lo scroll-margin-top). 'nearest' non scrollava se
            // la riga era gia' parzialmente in vista, lasciando il titolo
            // tagliato sopra.
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            revealCardInRail(target.querySelector('[data-season-rail]'), focusTargetEl, 0);
            return;
        }

        // Orizzontale: una card per volta dentro la riga.
        // ⚠️ Anche qui l'evento va consumato in OGNI uscita: il bordo della
        // riga e' un muro. Una freccia di troppo non consumata finisce allo
        // scroll nativo del browser, e uno scroll dell'utente ANNULLA lo
        // smooth scroll in corso — con il tasto tenuto premuto il rail si
        // fermava a meta' strada e ci restava (misurato il 2026-09-20).
        const current = e.target.closest('[data-video-id]');
        if (!current) return;
        e.preventDefault();
        e.stopPropagation();
        const target = e.key === 'ArrowRight' ? current.nextElementSibling : current.previousElementSibling;
        if (!target || !target.dataset || !target.dataset.videoId) return;
        const focusable = target.querySelector('[tabindex], a, button') || target;
        focusable.focus({ preventScroll: true });
        lastCardByRowRef.current.set(currentRow, target);
        revealCardInRail(currentRow.querySelector('[data-season-rail]'), target, e.key === 'ArrowRight' ? 1 : -1);
    }, []);

    // Auto-focus d'ingresso: una volta per titolo, sulla riga e sull'episodio
    // scelti sopra. ⚠️ Non ruba il focus se l'utente sta gia' navigando.
    // ⚠️ "Fatto" si segna quando il focus ATTERRA, non quando lo si schedula.
    // Con la marcatura anticipata bastava che il focus schedulato non andasse
    // in porto (la cleanup dell'effect lo annulla, e in StrictMode il ciclo
    // mount/unmount/mount lo annulla sempre) perche' la pagina restasse SENZA
    // NIENTE a fuoco — telecomando inerte — visto che la ri-esecuzione lo
    // considerava gia' fatto e non lo rischedulava. Si vedeva tornando
    // indietro dagli stream. In produzione StrictMode non raddoppia, ma la
    // fragilita' resta: due render ravvicinati bastano.
    const initialFocusDoneRef = React.useRef(null);
    const scheduledFocusRef = React.useRef(null);
    const pendingFocusRef = React.useRef(null);
    React.useEffect(() => {
        const root = scrollerRef.current;
        if (!root || !focusTarget) return;
        const key = `${metaReady?.id}:${focusSeason}`;
        if (initialFocusDoneRef.current === key || scheduledFocusRef.current === key) return;
        // L'utente sta gia' navigando: non gli si ruba il focus.
        const ae = document.activeElement;
        if (ae && ae !== document.body && root.contains(ae)) {
            initialFocusDoneRef.current = key;
            return;
        }
        scheduledFocusRef.current = key;
        const id = focusTarget.id;
        pendingFocusRef.current = setTimeout(() => {
            scheduledFocusRef.current = null;
            const sel = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(id) : id;
            const card = root.querySelector(`[data-video-id="${sel}"]`);
            if (!card) return;
            const el = card.querySelector('[tabindex], a, button') || card;
            el.focus({ preventScroll: true });
            initialFocusDoneRef.current = key;
            const row = card.closest('[data-season-row]');
            if (row) {
                row.scrollIntoView({ behavior: 'instant', block: 'start' });
                lastCardByRowRef.current.set(row, card);
                revealCardInRail(row.querySelector('[data-season-rail]'), card, 0);
            }
        }, 0);
        return () => {
            clearTimeout(pendingFocusRef.current);
            scheduledFocusRef.current = null;
        };
    }, [focusTarget, focusSeason, metaReady]);

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
        if (!value) return;
        const row = scrollerRef.current?.querySelector(`[data-season-row="${value}"]`);
        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    if (!metaItem || metaItem.content.type === 'Loading') {
        return (
            <div className={classnames(className, styles['videos-list-container'])}>
                <div className={styles['seasons-scroll']}>
                    <div className={styles['season-row']}>
                        <div className={styles['season-rail']}>
                            <Video.Placeholder />
                            <Video.Placeholder />
                            <Video.Placeholder />
                            <Video.Placeholder />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (metaItem.content.type === 'Err' || seasonRows.length === 0) {
        return (
            <div className={classnames(className, styles['videos-list-container'])}>
                <div className={styles['message-container']}>
                    <EpisodePicker className={styles['episode-picker']} onSubmit={onSeasonSearch} />
                    <Image className={styles['image']} src={require('/assets/images/empty.png')} alt={' '} />
                    <div className={styles['label']}>{t('ERR_NO_VIDEOS_FOR_META')}</div>
                </div>
            </div>
        );
    }

    return (
        <div className={classnames(className, styles['videos-list-container'])}>
            <div ref={setScrollerRef} className={styles['seasons-scroll']} onKeyDown={onKeyDown}>
                {
                    seasonRows.map((row) => {
                        const seasonWatched = row.videos.every((video) => video.watched);
                        return (
                            <div key={row.season} className={styles['season-row']} data-season-row={row.season}>
                                <div className={styles['season-title']} title={row.label}>{row.label}</div>
                                <div className={styles['season-rail']} data-season-rail={row.season}>
                                    {
                                        row.videos.map((video) => (
                                            <div
                                                key={video.id}
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
                                                    deepLinks={withSeason(video.deepLinks, video.season)}
                                                    scheduled={video.scheduled}
                                                    seasonWatched={seasonWatched}
                                                    selected={video.id === selectedVideoId}
                                                    onSelect={() => saveScrollPosition(video.season)}
                                                    onMarkVideoAsWatched={onMarkVideoAsWatched}
                                                    onMarkSeasonAsWatched={onMarkSeasonAsWatched}
                                                />
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        );
                    })
                }
            </div>
        </div>
    );
};

VideosList.propTypes = {
    className: PropTypes.string,
    metaItem: PropTypes.object,
    libraryItem: PropTypes.object,
    season: PropTypes.number,
    selectedVideoId: PropTypes.string,
    onSeasonOpened: PropTypes.func,
    onFocusedVideoChange: PropTypes.func,
};

module.exports = VideosList;
