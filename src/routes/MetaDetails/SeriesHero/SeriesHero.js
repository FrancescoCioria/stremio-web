// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: l'hero della pagina SERIE (handoff Claude Design "Series Detail",
// 2026-09-21). Sostituisce MetaPreview SOLO li': film, pagina stream e
// pannello del player restano su MetaPreview.
//
// Cosa cambia rispetto a prima, e perche' (dal README dell'handoff):
// - c'e' un'azione PRIMARIA (Riprendi / Guarda / Rivedi) e il focus parte da
//   li': OK = riparte l'episodio da dove eri. Prima la pagina non ne aveva;
// - "Rimuovi dalla libreria" non sta piu' nella riga delle azioni, a una
//   pressione distratta dal focus iniziale: vive dietro ⋯ e chiede conferma;
// - libreria e notifiche sono pill ACCESO/SPENTO (verde = acceso), non un
//   interruttore da telefono: col telecomando non c'e' un pomello da
//   trascinare, solo OK.
//
// ⚠️ "In libreria" ACCESO non si spegne con un OK: aprirebbe dalla porta di
// servizio proprio la rimozione a una pressione che l'handoff sposta dietro
// ⋯. OK su "In libreria" apre la stessa conferma. Da spento, OK aggiunge
// (non distruttivo).
//
// ⚠️ Omessi apposta perche' non hanno niente dietro nella nostra app: il
// bollino eta' (Cinemeta non ce l'ha), "Informazioni" e "Segnala un
// problema" nel menu ⋯. Il ♡ e' il "Love" che Stremio ha gia' (ratingInfo),
// il 👍 non ha posto nell'handoff e resta fuori da questa pagina.

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { useNavigate } = require('react-router');
const { default: toPath } = require('stremio-router/toPath');
const { default: Icon } = require('@stremio/stremio-icons/react');
const { Button, Image } = require('stremio/components');
const { default: useRating } = require('stremio/components/MetaPreview/Ratings/useRating');
const { resumeAction, resumeHref } = require('stremio/common/casaResume');
const LetterboxdMark = require('stremio/common/LetterboxdMark');
const styles = require('./styles');

const code = (v) => `S${String(v.season).padStart(2, '0')}E${String(v.episode).padStart(2, '0')}`;
const validDate = (d) => d instanceof Date && !isNaN(d.getTime());
const formatDate = (d) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\.$/, '');

// La nav della riga azioni: sinistra/destra fra i pulsanti, giu' nella
// lista. Consumate SEMPRE, anche al bordo: se no lo spatial-navigation
// polyfill porta il focus dove capita (stessa regola delle rail).
const ACTION_SELECTOR = '[data-hero-action]';

const SeriesHero = ({ className, name, logo, genres, seasonCount, episode, episodeRuntime, seriesDescription, imdbRating, featured, featuredRuntime, featuredSeasonWatched, trailerHref, inLibrary, onAddToLibrary, onRemoveFromLibrary, showNotifications, notificationsEnabled, onToggleNotifications, ratingInfo, onMarkSeasonWatched, autoFocus, infoOnly, kind, movieRuntime, year, letterboxdRating, rtScore, digitalReleaseLabel, watched, onToggleWatched, onClearResume }) => {
    // Casa, 2026-09-21: anche i FILM (richiesta dell'utente). Stesso hero,
    // senza episodio: il kicker dice FILM, i metadati portano cio' che il film
    // aveva in MetaPreview (Letterboxd, RT, "Disponibile dal"), e tra le azioni
    // c'e' "Visto". Niente primario: sotto c'e' subito la riga dei torrent.
    const isMovie = kind === 'movie';
    // ⚠️ Il ⋯ esiste solo se il suo menu ha almeno una voce. Un film NON in
    // libreria non ne ha (niente "segna la stagione", niente "rimuovi"): il ⋯
    // apriva un riquadro VUOTO, il focus non ci entrava, le frecce finivano al
    // polyfill e il riquadro restava aperto — trovato in review.
    const hasMenuItems = typeof onMarkSeasonWatched === 'function' || typeof onClearResume === 'function' || !!inLibrary;
    const navigate = useNavigate();
    const { onLiked, onLoved, liked, loved } = useRating(ratingInfo);
    const loveDisabled = ratingInfo?.type !== 'Ready';

    const action = React.useMemo(() => resumeAction(featured, featuredRuntime), [featured, featuredRuntime]);
    const href = React.useMemo(() => resumeHref(featured), [featured]);

    const actionsRef = React.useRef(null);
    const primaryRef = React.useRef(null);
    const moreRef = React.useRef(null);

    // Menu ⋯: null = chiuso, 'list' = voci, 'confirm-remove' = conferma.
    const [menu, setMenu] = React.useState(null);
    const menuRef = React.useRef(null);
    // Chiudendo, il focus torna su CHI ha aperto il menu: ⋯ o la pill "In
    // libreria" (che apre direttamente la conferma). Tornare sempre su ⋯
    // spostava l'utente di due posti senza che avesse premuto niente.
    const menuOpenerRef = React.useRef(null);
    const openMenu = React.useCallback((kind) => {
        menuOpenerRef.current = document.activeElement;
        setMenu(kind);
    }, []);
    const closeMenu = React.useCallback((refocus = true) => {
        setMenu(null);
        if (!refocus) return;
        setTimeout(() => {
            const back = menuOpenerRef.current && document.contains(menuOpenerRef.current) ? menuOpenerRef.current : moreRef.current;
            if (back) back.focus({ preventScroll: true });
        }, 0);
    }, []);
    // All'apertura il focus va sulla prima voce; nella conferma su ANNULLA:
    // su una domanda distruttiva la risposta di default e' quella innocua.
    React.useEffect(() => {
        if (!menu || !menuRef.current) return;
        const first = menuRef.current.querySelector('[data-menu-default]') || menuRef.current.querySelector('[tabindex]');
        if (first) first.focus({ preventScroll: true });
    }, [menu]);

    // Focus iniziale su Riprendi (handoff: "the single biggest fix").
    // ⚠️ `featured === undefined` = l'episodio in evidenza non e' ancora
    // arrivato da VideosList: si ASPETTA. Ripiegare subito sulla prima pill
    // metteva il focus su Trailer (visto nel probe) e lo segnava fatto, prima
    // che Riprendi esistesse. Si ripiega solo quando si SA che non c'e'
    // (featured null, o futuro: niente da far partire).
    const initialFocusDoneRef = React.useRef(false);
    React.useEffect(() => {
        if (!autoFocus || initialFocusDoneRef.current || featured === undefined) return;
        const target = primaryRef.current || (actionsRef.current && actionsRef.current.querySelector(ACTION_SELECTOR));
        if (!target) return;
        initialFocusDoneRef.current = true;
        target.focus({ preventScroll: true });
    }, [autoFocus, action, featured]);

    const onPlay = React.useCallback(() => {
        if (typeof href === 'string') navigate(toPath(href));
    }, [href, navigate]);

    const onLibrary = React.useCallback(() => {
        if (inLibrary) {
            openMenu('confirm-remove');
        } else if (typeof onAddToLibrary === 'function') {
            onAddToLibrary();
        }
    }, [inLibrary, onAddToLibrary, openMenu]);

    const onActionsKeyDown = React.useCallback((e) => {
        if (menu) return;
        const key = e.key;
        if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowDown' && key !== 'ArrowUp') return;
        e.preventDefault();
        e.stopPropagation();
        // Giu' lo gestisce VideosList (entra nella lista sull'episodio in
        // evidenza, listener nativo su metadetails-content); se non c'e' una
        // lista, qui si consuma e basta. Su: sopra non c'e' niente.
        if (key === 'ArrowDown' || key === 'ArrowUp') return;
        const items = actionsRef.current ? [...actionsRef.current.querySelectorAll(ACTION_SELECTOR)] : [];
        const idx = items.indexOf(document.activeElement);
        const next = items[idx + (key === 'ArrowRight' ? 1 : -1)];
        if (next) next.focus({ preventScroll: true });
    }, [menu]);

    const onMenuKeyDown = React.useCallback((e) => {
        // ⚠️ Escape e' il tasto Indietro del telecomando: senza fermarlo qui
        // risalirebbe al router e chiuderebbe la PAGINA invece del menu.
        if (e.key === 'Escape' || e.key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();
            closeMenu();
            return;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            const items = menuRef.current ? [...menuRef.current.querySelectorAll('[tabindex]')] : [];
            const idx = items.indexOf(document.activeElement);
            const next = items[(idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
            if (next) next.focus({ preventScroll: true });
            return;
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
        }
    }, [closeMenu]);

    const metaParts = [];
    if (typeof imdbRating === 'number') {
        metaParts.push(
            <span key={'rating'} className={styles['rating']}>
                <span className={styles['star']}>★</span>
                {imdbRating.toFixed(1).replace('.', ',')}
            </span>
        );
    }
    if (isMovie && typeof letterboxdRating === 'number') {
        metaParts.push(
            <span key={'letterboxd'} className={styles['rating-lb']}>
                <LetterboxdMark className={styles['lb-mark']} />
                {letterboxdRating.toFixed(1).replace('.', ',')}
            </span>
        );
    }
    if (isMovie && typeof rtScore === 'number') metaParts.push(<span key={'rt'}>{`RT ${rtScore}%`}</span>);
    if (isMovie && typeof digitalReleaseLabel === 'string' && digitalReleaseLabel.length > 0) {
        metaParts.push(<span key={'digital'} className={styles['digital']}>{digitalReleaseLabel}</span>);
    }
    if (typeof episodeRuntime === 'number' && episodeRuntime > 0) metaParts.push(<span key={'runtime'}>{`${episodeRuntime} min`}</span>);
    if (episode && validDate(episode.released)) metaParts.push(<span key={'date'}>{formatDate(episode.released)}</span>);
    if (Array.isArray(genres) && genres.length > 0) metaParts.push(<span key={'genre'}>{genres[0]}</span>);

    const summary = episode && typeof episode.overview === 'string' && episode.overview.length > 0 ? episode.overview : seriesDescription;

    return (
        <div className={classnames(className, styles['series-hero'])}>
            <div className={styles['kicker']}>
                <span>{isMovie ? 'FILM' : 'SERIE TV'}</span>
                {
                    isMovie && typeof movieRuntime === 'string' && movieRuntime.length > 0 ?
                        <React.Fragment>
                            <span className={styles['dot']} />
                            <span>{movieRuntime.toUpperCase()}</span>
                        </React.Fragment>
                        :
                        null
                }
                {
                    isMovie && typeof year === 'string' && year.length > 0 ?
                        <React.Fragment>
                            <span className={styles['dot']} />
                            <span>{year}</span>
                        </React.Fragment>
                        :
                        null
                }
                {
                    !isMovie && seasonCount > 0 ?
                        <React.Fragment>
                            <span className={styles['dot']} />
                            <span>{seasonCount === 1 ? '1 STAGIONE' : `${seasonCount} STAGIONI`}</span>
                        </React.Fragment>
                        :
                        null
                }
            </div>
            <div className={styles['logo-slot']}>
                {
                    typeof logo === 'string' && logo.length > 0 ?
                        <Image
                            className={styles['logo']}
                            src={logo}
                            alt={name}
                            renderFallback={() => <div className={styles['wordmark']}>{name}</div>}
                        />
                        :
                        // Fallback tipografico dell'handoff: la copertura dei
                        // loghi e' a macchia di leopardo.
                        <div className={styles['wordmark']}>{name}</div>
                }
            </div>
            {/* Sempre presente (alta una riga anche vuota): l'episodio in
                evidenza arriva DOPO il primo render, e comparendo spingeva giu'
                tutta la pagina. */}
            {/* Sui film niente riga episodio: il logo E' il titolo. */}
            {isMovie ? null :
                <div className={styles['identity']}>
                    {
                        episode ?
                            <React.Fragment>
                                <span className={styles['code']}>{code(episode)}</span>
                                <span className={styles['episode-title']}>{episode.title || episode.name || ''}</span>
                            </React.Fragment>
                            :
                            null
                    }
                </div>}
            {/* Sempre presente, anche vuota: se sparisse su un episodio senza
                data la pagina salterebbe di una riga. */}
            <div className={styles['meta-row']}>
                {metaParts.map((part, i) => (
                    <React.Fragment key={i}>
                        {i > 0 ? <span className={styles['dot']} /> : null}
                        {part}
                    </React.Fragment>
                ))}
            </div>
            {/* Sempre presente, con l'altezza di tre righe: vedi styles. */}
            <p className={styles['summary']}>{typeof summary === 'string' ? summary : ''}</p>
            {/* Pagina torrent di un episodio: l'hero e' SOLO informazioni. Li'
                si sceglie un torrent: Riprendi, libreria e il resto erano gia'
                nascosti (hideActions) prima dell'hero nuovo. */}
            {infoOnly ? null :
                <div ref={actionsRef} className={styles['actions']} onKeyDown={onActionsKeyDown} data-casa-hero-actions={''}>
                    {
                        action !== null ?
                            <div className={styles['primary-wrap']}>
                                <Button ref={primaryRef} className={styles['primary']} title={action.label} onClick={onPlay} data-hero-action={''}>
                                    <span className={styles['play-glyph']} />
                                    <span className={styles['primary-labels']}>
                                        <span className={styles['primary-label']}>{action.label}</span>
                                        <span className={styles['primary-sublabel']}>{action.sublabel}</span>
                                    </span>
                                </Button>
                                {
                                    action.progress !== null ?
                                        <div className={styles['primary-progress']}>
                                            <div className={styles['primary-progress-fill']} style={{ width: `${action.progress}%` }} />
                                        </div>
                                        :
                                        null
                                }
                            </div>
                            :
                            null
                    }
                    <div className={styles['secondary']}>
                        {
                            typeof trailerHref === 'string' ?
                                <Button className={styles['pill']} title={'Trailer'} href={trailerHref} data-hero-action={''}>
                                    <Icon className={styles['pill-icon']} name={'trailer'} />
                                    Trailer
                                </Button>
                                :
                                null
                        }
                        <Button className={classnames(styles['pill'], { [styles['on']]: inLibrary })} title={inLibrary ? 'In libreria' : 'Aggiungi alla libreria'} onClick={onLibrary} data-hero-action={''}>
                            <Icon className={styles['pill-icon']} name={inLibrary ? 'checkmark' : 'add'} />
                            {inLibrary ? 'In libreria' : 'Aggiungi'}
                        </Button>
                        {
                            isMovie && typeof onToggleWatched === 'function' ?
                                // Non distruttivo e reversibile: si accende/spegne con OK.
                                <Button className={classnames(styles['pill'], { [styles['on']]: watched })} title={watched ? 'Visto' : 'Segna come visto'} onClick={onToggleWatched} data-hero-action={''}>
                                    <Icon className={styles['pill-icon']} name={watched ? 'checkmark' : 'eye'} />
                                    {watched ? 'Visto' : 'Segna come visto'}
                                </Button>
                                :
                                null
                        }
                        {
                            showNotifications ?
                                <Button className={classnames(styles['pill'], { [styles['on']]: notificationsEnabled })} title={'Notifiche nuovi episodi'} onClick={onToggleNotifications} data-hero-action={''}>
                                    <span className={classnames(styles['notif-dot'], { [styles['on']]: notificationsEnabled })} />
                                    Notifiche
                                </Button>
                                :
                                null
                        }
                        {/* 👍 e ♡ nella riga delle azioni, a destra (richiesta dell'utente,
                        come proponeva l'handoff per il ♡): prima stavano in un gruppo
                        a parte sotto la riga, che il telecomando non raggiungeva. */}
                        <Button className={classnames(styles['icon-button'], { [styles['on']]: liked })} title={liked ? 'Non mi piace piu\'' : 'Mi piace'} onClick={loveDisabled ? null : onLiked} data-hero-action={''}>
                            <Icon className={styles['icon']} name={liked ? 'thumbs-up' : 'thumbs-up-outline'} />
                        </Button>
                        <Button className={classnames(styles['icon-button'], { [styles['on']]: loved })} title={loved ? 'Non lo amo piu\'' : 'Lo amo'} onClick={loveDisabled ? null : onLoved} data-hero-action={''}>
                            <Icon className={styles['icon']} name={loved ? 'heart' : 'heart-outline'} />
                        </Button>
                        {hasMenuItems ?
                            <div className={styles['more-wrap']}>
                                <Button ref={moreRef} className={styles['icon-button']} title={'Altro'} onClick={() => openMenu('list')} data-hero-action={''}>
                                    <Icon className={styles['icon']} name={'more-horizontal'} />
                                </Button>
                                {
                                    menu !== null ?
                                        <div ref={menuRef} className={styles['menu']} onKeyDown={onMenuKeyDown} data-hero-menu={''}>
                                            {
                                                menu === 'list' ?
                                                    <React.Fragment>
                                                        {
                                                            typeof onMarkSeasonWatched === 'function' ?
                                                                <Button className={styles['menu-item']} onClick={() => { onMarkSeasonWatched(); closeMenu(); }}>
                                                                    {featuredSeasonWatched ? 'Togli il visto dalla stagione' : 'Segna la stagione come vista'}
                                                                </Button>
                                                                :
                                                                null
                                                        }
                                                        {
                                                            // Azzera SOLO il punto di ripresa (i visti e le
                                                            // notifiche restano): e' il posto del vecchio
                                                            // dismiss di Continue Watching, tolto dalla card.
                                                            typeof onClearResume === 'function' ?
                                                                <Button className={styles['menu-item']} onClick={() => { onClearResume(); closeMenu(); }}>
                                                                    Azzera
                                                                </Button>
                                                                :
                                                                null
                                                        }
                                                        {
                                                            inLibrary ?
                                                                <Button className={classnames(styles['menu-item'], styles['danger'])} onClick={() => setMenu('confirm-remove')}>
                                                                    Rimuovi dalla libreria
                                                                </Button>
                                                                :
                                                                null
                                                        }
                                                    </React.Fragment>
                                                    :
                                                    <React.Fragment>
                                                        <div className={styles['menu-question']}>Rimuovere dalla libreria?</div>
                                                        <Button className={styles['menu-item']} data-menu-default={''} onClick={() => closeMenu()}>
                                                            Annulla
                                                        </Button>
                                                        <Button className={classnames(styles['menu-item'], styles['danger'])} onClick={() => { if (typeof onRemoveFromLibrary === 'function') onRemoveFromLibrary(); closeMenu(); }}>
                                                            Rimuovi
                                                        </Button>
                                                    </React.Fragment>
                                            }
                                        </div>
                                        :
                                        null
                                }
                            </div>
                            : null}
                    </div>
                </div>}
        </div>
    );
};

SeriesHero.propTypes = {
    className: PropTypes.string,
    name: PropTypes.string,
    logo: PropTypes.string,
    genres: PropTypes.arrayOf(PropTypes.string),
    seasonCount: PropTypes.number,
    episode: PropTypes.object,
    episodeRuntime: PropTypes.number,
    seriesDescription: PropTypes.string,
    imdbRating: PropTypes.number,
    featured: PropTypes.object,
    featuredRuntime: PropTypes.number,
    featuredSeasonWatched: PropTypes.bool,
    trailerHref: PropTypes.string,
    inLibrary: PropTypes.bool,
    onAddToLibrary: PropTypes.func,
    onRemoveFromLibrary: PropTypes.func,
    onClearResume: PropTypes.func,
    showNotifications: PropTypes.bool,
    notificationsEnabled: PropTypes.bool,
    onToggleNotifications: PropTypes.func,
    ratingInfo: PropTypes.object,
    onMarkSeasonWatched: PropTypes.func,
    autoFocus: PropTypes.bool,
    infoOnly: PropTypes.bool,
    kind: PropTypes.oneOf(['series', 'movie']),
    movieRuntime: PropTypes.string,
    year: PropTypes.string,
    letterboxdRating: PropTypes.number,
    rtScore: PropTypes.number,
    digitalReleaseLabel: PropTypes.string,
    watched: PropTypes.bool,
    onToggleWatched: PropTypes.func,
};

module.exports = SeriesHero;
