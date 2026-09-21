// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { t } = require('i18next');
const { useCore } = require('stremio/core');
const { Image, Video } = require('stremio/components');
const { mergeCasaExtraVideos } = require('stremio/common/casaExtraVideos');
const { pickSeason, pickFocusVideo, holdSeason, seasonSummary, seasonCountLabel, compareSeasons } = require('stremio/common/casaEpisodeFocus');
const { casaBeacon } = require('stremio/common/casaBackend');
const { revealCardInRail } = require('stremio/common/casaRailNav');
const { handleRowsKeyDown, revealRow: revealRowBy, heroFirstAction } = require('stremio/common/casaRowsNav');

// Le righe di questa pagina per la nav condivisa (common/casaRowsNav.js).
const ROW = '[data-season-row]';
const RAIL = '[data-season-rail]';
const CARD = '[data-video-id]';
const useCasaExtraVideos = require('stremio/routes/MetaDetails/useCasaExtraVideos');
const useEpisodeRuntimes = require('stremio/common/useEpisodeRuntimes');
const { episodeState } = require('stremio/common/casaEpisodeCard');
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

// Una riga stagione. Componente a se' per poter chiedere le durate REALI della
// sua stagione (un hook per stagione: non si chiama un hook in un ciclo).
// ⚠️ Una richiesta per stagione all'apertura, deliberato: mediana 2 stagioni
// sulla library vera, e il backend le tiene in cache 24h.
const SeasonRow = ({ row, metaType, metaId, focusTargetId, selectedVideoId, onOpen, onMarkVideoAsWatched, onMarkSeasonAsWatched }) => {
    // ⚠️ Sugli Extra (stagione 0) la durata NON si chiede: TMDB e Cinemeta
    // numerano gli speciali in modo diverso (Rick and Morty: 37 contro 113, lo
    // speciale 2 di Cinemeta e' uno spot, quello di TMDB un'altra cosa), e la
    // card mostrerebbe durate sbagliate ma credibili — l'errore che la durata
    // "reale" esiste per evitare. Senza, si omette. Preso in review.
    const runtimes = useEpisodeRuntimes(metaType, metaId, row.season === 0 ? null : row.season);
    const seasonWatched = row.videos.every((video) => video.watched);
    return (
        <div className={styles['season-row']} data-season-row={row.season === null ? '' : row.season}>
            {
                row.label !== null ?
                    <div className={styles['season-header']}>
                        <div className={styles['season-title']}>{row.label}</div>
                        {
                            row.inProgress ?
                                <div className={styles['season-chip']}>IN CORSO</div>
                                :
                                null
                        }
                        {/* Accanto al titolo, non in fondo a destra (richiesta
                            dell'utente): si legge insieme a "Stagione X". */}
                        <div className={styles['season-count']}>{row.countLabel}</div>
                    </div>
                    :
                    null
            }
            <div className={styles['season-rail']} data-season-rail={row.season === null ? '' : row.season}>
                {
                    row.videos.map((video) => {
                        // ⚠️ Un episodio FUTURO non si apre: niente deep link e
                        // niente onSelect, quindi OK non fa niente. Resta a fuoco
                        // (lo si legge), non e' un vicolo cieco: le frecce vanno.
                        const upcoming = episodeState(video) === 'upcoming';
                        const runtime = runtimes.season === row.season && typeof runtimes.runtimes[video.episode] === 'number'
                            ? runtimes.runtimes[video.episode]
                            : null;
                        return (
                            <div
                                key={video.id}
                                className={styles['video-wrapper']}
                                data-video-id={video.id}
                                data-casa-focus={video.id === focusTargetId ? '1' : undefined}
                            >
                                <Video
                                    variant={'casa-series'}
                                    runtime={runtime}
                                    id={video.id}
                                    title={video.title}
                                    thumbnail={video.thumbnail}
                                    season={video.season}
                                    episode={video.episode}
                                    released={video.released}
                                    upcoming={video.upcoming}
                                    watched={video.watched}
                                    progress={video.progress}
                                    deepLinks={upcoming ? null : withSeason(video.deepLinks, video.season)}
                                    scheduled={video.scheduled}
                                    seasonWatched={seasonWatched}
                                    selected={video.id === selectedVideoId}
                                    onSelect={upcoming ? null : () => onOpen(video.season)}
                                    onMarkVideoAsWatched={onMarkVideoAsWatched}
                                    onMarkSeasonAsWatched={onMarkSeasonAsWatched}
                                />
                            </div>
                        );
                    })
                }
            </div>
        </div>
    );
};

SeasonRow.propTypes = {
    row: PropTypes.object.isRequired,
    metaType: PropTypes.string,
    metaId: PropTypes.string,
    focusTargetId: PropTypes.string,
    selectedVideoId: PropTypes.string,
    onOpen: PropTypes.func.isRequired,
    onMarkVideoAsWatched: PropTypes.func.isRequired,
    onMarkSeasonAsWatched: PropTypes.func.isRequired,
};

// Scroll verticale della lista, preservato tra l'apertura di un episodio e il
// ritorno. ⚠️ Qui e' `scrollTop` per davvero: lo scroller delle righe e'
// verticale (quello ORIZZONTALE e' la rail dentro ogni riga, e la sua
// posizione la ricompone l'auto-focus).
//
// ⚠️ Porta con se' il TITOLO a cui appartiene, e si consuma quando lo scroller
// COMPARE (dentro la callback ref), non in un layout effect al mount: se il
// primo render e' il ramo Loading lo scroller non esiste ancora, e un effect
// con `[]` non torna piu' — cioe' falliva proprio nel caso per cui esiste
// (tornare dagli stream con il meta ancora in volo). Peggio: il valore
// stantio restava li' e si applicava al prossimo titolo aperto, che partiva
// scrollato a un punto che non significava niente.
let savedScroll = null;

const VideosList = ({ className, metaItem, libraryItem, season, selectedVideoId, onSeasonOpened, onEpisodeSearch, onFocusedVideoChange, onFeaturedChange, heroTakesFocus }) => {
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
    // L'ultima card che ha avuto il focus nella lista: dall'hero si torna li'.
    const lastListCardRef = React.useRef(null);
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
    const metaIdRef = React.useRef(null);
    const setScrollerRef = React.useCallback((el) => {
        const prev = scrollerRef.current;
        if (prev && prev._casaTvCleanup) prev._casaTvCleanup();
        scrollerRef.current = el;
        if (!el) return;
        if (savedScroll && savedScroll.metaId === metaIdRef.current) {
            el.scrollTop = savedScroll.scrollTop;
        }
        savedScroll = null;
        const onFocusIn = (e) => {
            let n = e.target;
            while (n && n !== el) {
                if (n.dataset && n.dataset.videoId) {
                    setFocusedVideoId(n.dataset.videoId);
                    lastListCardRef.current = n;
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
        savedScroll = { metaId: metaIdRef.current, scrollTop: scrollerRef.current?.scrollTop ?? 0 };
        if (typeof videoSeason === 'number' && typeof onSeasonOpenedRef.current === 'function') {
            onSeasonOpenedRef.current(videoSeason);
        }
    }, []);

    const metaReady = metaItem && metaItem.content.type === 'Ready' ? metaItem.content.content : null;
    metaIdRef.current = metaReady ? metaReady.id : null;
    // Casa: episodi che esistono ma che Cinemeta non elenca (X Factor
    // 2026-09-18). Il merge de-duplica contro il meta vero -> appena il core li
    // elenca, i nostri spariscono. Vedi common/casaExtraVideos.js.
    const casaExtra = useCasaExtraVideos(metaReady ? metaReady.type : null, metaReady ? metaReady.id : null);
    const videos = React.useMemo(() => {
        return mergeCasaExtraVideos(metaReady ? metaReady.videos : [], casaExtra, metaReady ? metaReady.id : null, metaReady ? metaReady.background : null, libraryItem ? libraryItem.state : null);
    }, [metaReady, casaExtra, libraryItem]);

    const seasons = React.useMemo(() => {
        return videos
            .map(({ season }) => season)
            .filter((season, index, seasons) => {
                return season !== null &&
                    !isNaN(season) &&
                    typeof season === 'number' &&
                    seasons.indexOf(season) === index;
            })
            // La piu' recente in alto, gli Extra in fondo: vedi compareSeasons.
            .sort(compareSeasons);
    }, [videos]);

    // Una riga per stagione, nell'ordine di `seasons`: la piu' recente in
    // alto, gli Extra (stagione 0) in fondo (vedi compareSeasons). Dove si
    // atterra lo decide l'auto-focus, non l'ordine.
    const seasonRows = React.useMemo(() => {
        // ⚠️ Episodi senza stagione numerica (meta di canali/tv, o una riga
        // di extra-videos con `season` non numerica): `seasons` li scarta,
        // e costruire le righe SOLO da `seasons` li faceva sparire dalla
        // pagina — che mostrava "nessun episodio" avendone in mano. Prima il
        // filtro ripiegava su tutti i video quando la stagione era null. Una
        // riga sola, senza titolo: non c'e' una stagione da annunciare.
        if (seasons.length === 0) {
            return videos.length > 0 ? [{ season: null, label: null, videos }] : [];
        }
        return seasons.map((s) => {
            const rowVideos = videos
                .filter((video) => video.season === s)
                .sort((a, b) => a.episode - b.episode);
            const summary = seasonSummary(rowVideos);
            const extra = s === 0;
            return {
                season: s,
                // Italiano come il resto della pagina serie (handoff).
                label: extra ? 'Extra' : `Stagione ${s}`,
                videos: rowVideos,
                inProgress: !extra && summary.inProgress,
                countLabel: seasonCountLabel(summary, { extra }),
            };
        });
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
    // L'hero (SeriesHero) ne fa il pulsante Riprendi/Guarda/Rivedi e lo
    // descrive quando il focus non e' su una card: una sola regola decide
    // "l'episodio in evidenza", ed e' questa.
    // ⚠️ Si parla solo quando le righe ci sono: mentre la lista carica,
    // focusTarget e' null e dirlo all'hero significava "non c'e' niente da
    // riprendere" — l'hero ripiegava sulla prima pill e il focus d'ingresso
    // finiva su Trailer (preso col log dei focusin, non a occhio).
    React.useEffect(() => {
        if (typeof onFeaturedChange !== 'function' || seasonRows.length === 0) return;
        onFeaturedChange(focusTarget || null);
    }, [focusTarget, onFeaturedChange, seasonRows.length]);

    // Si vede SEMPRE una riga vicina: regola e cicatrici in common/casaRowsNav.js.
    // NB la home fa diversamente apposta (l'ultima riga sale in cima e sotto
    // resta il vuoto) — li' le righe sono tante e il vuoto in fondo e' il
    // segnale che la lista e' finita; qui le stagioni sono 2 nella mediana.
    const revealRow = (row, behavior) => revealRowBy(row, behavior, ROW);

    // Memoria dell'ultima card per riga: passando da riga A card 5 a riga B e
    // tornando su, il focus torna su A card 5 e non su A card 0 (che sarebbe
    // fuori schermo, con "niente di selezionato" a vedersi). WeakMap con key
    // l'elemento riga: se la riga remonta, la entry decade da sola.
    const lastCardByRowRef = React.useRef(new WeakMap());

    // Nav da telecomando: verticale fra righe, orizzontale nella riga, i bordi
    // sono muri. Tutto in common/casaRowsNav.js, condiviso con la lista torrent.
    // Sopra la prima riga c'e' l'hero: ArrowUp ci sale (Riprendi / prima azione).
    const onKeyDown = React.useCallback((e) => {
        handleRowsKeyDown(e, {
            root: scrollerRef.current,
            rowSel: ROW,
            railSel: RAIL,
            cardSel: CARD,
            lastCardByRow: lastCardByRowRef.current,
            onExitUp: () => {
                const action = heroFirstAction(scrollerRef.current);
                if (action) action.focus({ preventScroll: true });
            },
        });
    }, []);

    // ⚠️ Il ritorno dall'hero alla lista. L'uscita verso l'alto la governiamo
    // noi, ma la discesa no: MetaPreview e ActionButton non hanno handler, e
    // senza questo ArrowDown finirebbe allo spatial-navigation polyfill, che
    // fa un focus() NUDO — niente preventScroll, niente reveal nella rail,
    // niente memoria della colonna: si atterra su una card a caso col titolo
    // della stagione tagliato sopra il viewport. E' lo stesso motivo per cui
    // Board.js tiene il suo handler. Prima ci pensavano le pill.
    // Dall'hero si entra nella lista: sull'ultima card che aveva il focus
    // (se si era saliti dalla lista, si torna DOVE si era), altrimenti
    // sull'episodio in evidenza — l'handoff: "Down from the action row lands on
    // the current/next-to-watch episode, not on episode 1".
    const enterList = React.useCallback(() => {
        const root = scrollerRef.current;
        if (!root) return false;
        const remembered = lastListCardRef.current;
        const wrapper = (remembered && root.contains(remembered)) ? remembered :
            root.querySelector('[data-casa-focus="1"]') || root.querySelector('[data-video-id]');
        if (!wrapper) return false;
        const row = wrapper.closest('[data-season-row]');
        const el = wrapper.querySelector('[tabindex], a, button') || wrapper;
        el.focus({ preventScroll: true });
        if (row) {
            lastCardByRowRef.current.set(row, wrapper);
            revealRow(row, 'smooth');
            revealCardInRail(row.querySelector('[data-season-rail]'), wrapper, 0);
        }
        return true;
    }, []);
    React.useEffect(() => {
        const root = scrollerRef.current;
        const content = root && root.closest('[class*="metadetails-content"]');
        if (!content) return;
        const onHeroKeyDown = (e) => {
            if (e.key !== 'ArrowDown') return;
            const ae = document.activeElement;
            // MetaPreview (film) o l'hero della serie (SeriesHero).
            if (!ae || !ae.closest || !ae.closest('[class*="action-buttons-container"], [data-casa-hero-actions]')) return;
            // ⚠️ Non dal menu ⋯ dell'hero: le sue voci stanno DENTRO la riga
            // azioni, e questo listener (nativo, su un antenato) scatta PRIMA
            // dell'onKeyDown React del menu. Giu' su "Segna la stagione..."
            // saltava nella lista col menu ancora aperto — dopo, Indietro usciva
            // dalla PAGINA. Preso in review, il test provava solo Indietro.
            if (ae.closest('[data-hero-menu]')) return;
            if (enterList()) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        content.addEventListener('keydown', onHeroKeyDown);
        return () => content.removeEventListener('keydown', onHeroKeyDown);
    }, [enterList, seasonRows.length]);

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
        // ⚠️ Con l'hero della serie il focus d'ingresso e' su Riprendi (lo
        // prende SeriesHero): qui la lista si POSIZIONA sull'episodio in
        // evidenza senza prendere il focus. Eccezione: il RITORNO dagli
        // stream (stagione nell'URL) — li' l'utente aveva scelto un
        // episodio, e rimandarlo su Riprendi gli farebbe perdere il posto.
        const takeFocus = !heroTakesFocus || typeof season === 'number';
        pendingFocusRef.current = setTimeout(() => {
            scheduledFocusRef.current = null;
            const sel = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(id) : id;
            // ⚠️ Se la card esatta non si trova, si ripiega sulla prima della
            // riga invece di arrendersi: senza focus il telecomando e' inerte
            // e nessun re-render verrebbe a riprovare — un vicolo cieco muto.
            const row = root.querySelector(`[data-season-row="${focusSeason === null ? '' : focusSeason}"]`);
            const card = root.querySelector(`[data-video-id="${sel}"]`) ||
                (row && row.querySelector('[data-video-id]')) ||
                root.querySelector('[data-video-id]');
            if (!card) return;
            const el = card.querySelector('[tabindex], a, button') || card;
            if (takeFocus) el.focus({ preventScroll: true });
            initialFocusDoneRef.current = key;
            const landed = card.closest('[data-season-row]');
            if (landed) {
                revealRow(landed, 'instant');
                lastCardByRowRef.current.set(landed, card);
                revealCardInRail(landed.querySelector('[data-season-rail]'), card, 0);
            }
        }, 0);
        return () => {
            clearTimeout(pendingFocusRef.current);
            scheduledFocusRef.current = null;
        };
    }, [focusTarget, focusSeason, metaReady, heroTakesFocus, season]);

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
                    {/* ⚠️ Deve navigare all'EPISODIO, non "scegliere una
                        stagione": questo ramo si disegna solo quando di righe
                        non ce n'e' NESSUNA, quindi non c'e' niente su cui
                        scorrere. Cablato allo stesso handler che usa la
                        pagina stream. */}
                    <EpisodePicker className={styles['episode-picker']} onSubmit={onEpisodeSearch} />
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
                    seasonRows.map((row) => (
                        <SeasonRow
                            key={row.season === null ? 'all' : row.season}
                            row={row}
                            metaType={metaReady ? metaReady.type : null}
                            metaId={metaReady ? metaReady.id : null}
                            focusTargetId={focusTarget ? focusTarget.id : null}
                            selectedVideoId={selectedVideoId}
                            onOpen={saveScrollPosition}
                            onMarkVideoAsWatched={onMarkVideoAsWatched}
                            onMarkSeasonAsWatched={onMarkSeasonAsWatched}
                        />
                    ))
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
    onEpisodeSearch: PropTypes.func,
    onFeaturedChange: PropTypes.func,
    heroTakesFocus: PropTypes.bool,
    onFocusedVideoChange: PropTypes.func,
};

module.exports = VideosList;
