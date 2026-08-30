// Copyright (C) 2024 — Casa TV fork
// Hero top della Board che mostra info dell'item FOCUSATO nelle rail.
// Ispirato dal layout Android TV: titolo grande left, background-art right,
// runtime/year/rating, genres, description, cast. Niente pulsanti (sono su
// MetaDetails quando cliccato).

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { Image } = require('stremio/components');
const useLetterboxdRating = require('stremio/common/useLetterboxdRating');
const useTitleAvailability = require('stremio/common/useTitleAvailability');
const { warmMeta, getCached: getCachedMeta, baseIdOf } = require('stremio/common/casaMetaCache');
const styles = require('./styles');

// Cache meta arricchiti da Cinemeta (CW items hanno solo poster+name+id,
// mancano description/genres/cast/rating). ⚠️ Vive in `common/casaMetaCache.js`
// e PERSISTE fra i reload: era una Map di modulo, quindi ogni ricarica del
// bundle ricominciava da zero e l'hero tornava a caricare al focus su titoli
// gia' visti. Lo stesso modulo espone `warmMeta`, che il Board usa per
// scaldarli in anticipo.

// Enrichment se manca almeno uno dei campi mostrati dall'hero. Le rail
// Featured (Cinemeta) mandano tutto inline; altri addon spesso mandano
// description+genres ma omettono rating/runtime/releaseInfo/background
// — l'hero mostrerebbe solo titolo + cast se non li fetchassimo.
const needsEnrichment = (m) => !m || (
    !m.imdbRating || !m.runtime || !m.releaseInfo || !m.description ||
    !m.background || !m.logo ||
    (!Array.isArray(m.genres) || m.genres.length === 0) ||
    (!Array.isArray(m.cast) || m.cast.length === 0) ||
    (!Array.isArray(m.director) || m.director.length === 0)
);

const useEnrichedMeta = (meta) => {
    const [enriched, setEnriched] = React.useState(meta);
    // `done` distingue "enrichment in flight" da "skip/finito": durante
    // l'in-flight non mostriamo il fallback testuale del titolo, cosi'
    // l'utente non vede il flicker testo→logo (il logo arriva da Cinemeta).
    const [done, setDone] = React.useState(false);
    React.useEffect(() => {
        setEnriched(meta);
        if (!meta || !needsEnrichment(meta) || !meta.type) {
            setDone(true);
            return undefined;
        }
        // Continue Watching items hanno `_id` invece di `id`. Per gli episodi di
        // serie il formato e' `tt12345:1:1` — Cinemeta vuole solo il parent, e
        // se ne occupa casaMetaCache.
        const fullId = meta.id || meta._id;
        const cached = getCachedMeta(meta.type, fullId);
        if (cached) {
            // Colpo di cache: nessun fetch, nessun `done: false` -> l'hero non
            // passa mai dallo stato "sto caricando". E' tutto il punto del
            // prefetch: al focus l'informazione c'e' gia'.
            setEnriched({ ...meta, ...cached });
            setDone(true);
            return undefined;
        }
        if (!baseIdOf(fullId)) {
            setDone(true);
            return undefined;
        }
        setDone(false);
        let cancelled = false;
        warmMeta(meta.type, fullId)
            .then((enrichment) => {
                if (cancelled || !enrichment) return;
                setEnriched({ ...meta, ...enrichment });
            })
            .finally(() => { if (!cancelled) setDone(true); });
        return () => { cancelled = true; };
    }, [meta]);
    return { meta: enriched, done };
};

// Data compatta dell'uscita DIGITALE, o null se non la sappiamo / non e' un
// film. Formato uguale al resto della UI (`toLocaleDateString` senza locale
// forzata), cosi' la riga non mescola due lingue.
const digitalDateLabel = (type, availability) => {
    if (type !== 'movie' || !availability || !availability.loaded) return null;
    const iso = availability.digitalRelease;
    if (typeof iso !== 'string' || iso.length === 0) return null;
    const t = Date.parse(iso);
    if (!isFinite(t)) return null;
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const BoardHero = ({ meta: rawMeta }) => {
    const { meta, done: enrichmentDone } = useEnrichedMeta(rawMeta);
    // ⚠️ Prima delle uscite anticipate: gli hook non possono stare sotto un
    // `return`. Con `meta` nullo passa (null, null) e non chiede niente.
    const ratings = useLetterboxdRating(meta?.type, meta?.id);
    const availability = useTitleAvailability(meta?.type, meta?.type === 'movie' ? meta?.id : null);
    if (!meta) {
        return <div className={styles['board-hero-container']} />;
    }

    // ⚠️ Cinemeta PRIMA (e' gia' in memoria), il dataset IMDb quando Cinemeta non
    // ce l'ha: sui titoli usciti da poche settimane Cinemeta e' indietro, e
    // l'hero restava senza nessun voto proprio sulle novita' — che sono il
    // contenuto di meta' delle righe.
    const rating = meta.imdbRating
        ? `${meta.imdbRating}`
        : (typeof ratings.imdb === 'number' ? ratings.imdb.toFixed(1) : null);
    // ⚠️ Il voto Letterboxd sta ANCHE qui, non solo nel dettaglio: questa e' la
    // riga che si legge dalla home, ed e' quella che l'utente guarda per
    // decidere. Su tanti film nuovi Cinemeta non ha ancora l'imdbRating (torna
    // stringa vuota) — senza Letterboxd l'hero non mostrava NESSUN voto, e la
    // riga sotto sembrava ordinata a caso.
    const lbRating = typeof ratings.rating10 === 'number' ? ratings.rating10.toFixed(1) : null;
    // ⚠️ Film o serie, DETTO: era la domanda per cui bisognava entrare nella
    // pagina e tornare indietro — cioe' esattamente il passo da togliere.
    const typeLabel = meta.type === 'movie' ? 'Film' : meta.type === 'series' ? 'Serie' : null;
    // ⚠️ `releaseInfo` di Cinemeta e' il solo ANNO ("2026"), che su una riga di
    // NOVITA' non dice niente: fra "uscito tre giorni fa" e "uscito a gennaio"
    // c'e' tutta la differenza. Quando conosciamo la data DIGITALE del film
    // (quella da cui lo si puo' guardare davvero) mostriamo quella, che l'anno
    // ce l'ha dentro. Serie e film senza data: resta l'anno, come prima.
    const releaseText = digitalDateLabel(meta.type, availability) ?? meta.releaseInfo;
    const genresText = Array.isArray(meta.genres) ? meta.genres.slice(0, 3).join(' · ') : null;
    const castText = Array.isArray(meta.cast) ? meta.cast.slice(0, 3).join(', ') : null;
    const directorText = Array.isArray(meta.director) ? meta.director.slice(0, 2).join(', ') : null;
    // Se non c'e' background, fallback al poster (blur per non distrarre).
    const bgSrc = (typeof meta.background === 'string' && meta.background.length > 0)
        ? meta.background
        : (typeof meta.poster === 'string' && meta.poster.length > 0 ? meta.poster : null);
    const bgIsPoster = bgSrc === meta.poster;

    return (
        <div className={classnames(styles['board-hero-container'], 'animation-fade-in')}>
            {
                bgSrc ?
                    <div className={classnames(styles['hero-bg-layer'], { [styles['blurred']]: bgIsPoster })}>
                        <Image
                            key={meta.id}
                            className={styles['hero-bg-image']}
                            src={bgSrc}
                            alt={' '}
                            renderFallback={() => null}
                        />
                        <div className={styles['hero-bg-gradient']} />
                    </div>
                    :
                    null
            }
            <div className={styles['hero-info']}>
                <div className={styles['hero-logo-slot']}>
                    {
                        typeof meta.logo === 'string' && meta.logo.length > 0 ?
                            <Image
                                key={meta.id + '-logo'}
                                className={styles['hero-logo']}
                                src={meta.logo}
                                alt={meta.name}
                                renderFallback={() => (
                                    <div className={styles['hero-title']}>{meta.name}</div>
                                )}
                            />
                            : enrichmentDone ?
                                <div className={styles['hero-title']}>{meta.name}</div>
                                : null
                    }
                </div>
                <div className={styles['hero-subline']}>
                    {typeLabel ?
                        <span className={classnames(styles['sub-item'], styles['type-label'])}>{typeLabel}</span> : null}
                    {typeof meta.runtime === 'string' && meta.runtime.length > 0 ?
                        <span className={styles['sub-item']}>{meta.runtime}</span> : null}
                    {typeof releaseText === 'string' && releaseText.length > 0 ?
                        <span className={styles['sub-item']}>{releaseText}</span> : null}
                    {lbRating ?
                        <span className={classnames(styles['sub-item'], styles['rating'])}>
                            {lbRating}
                            <span className={styles['letterboxd-mark']}>
                                <span /><span /><span />
                            </span>
                        </span> : null}
                    {rating ?
                        <span className={classnames(styles['sub-item'], styles['rating'])}>
                            {rating}
                            <span className={styles['imdb-badge']}>IMDb</span>
                        </span> : null}
                    {/* ⚠️ Ci sono di rado (Metacritic ~33% dei titoli, Rotten
                        Tomatoes ~6%): compaiono quando ci sono e spariscono
                        senza lasciare buchi, e NON ordinano niente. */}
                    {typeof ratings.metacritic === 'number' ?
                        <span className={classnames(styles['sub-item'], styles['rating'])}>
                            {ratings.metacritic}
                            <span className={styles['metacritic-badge']}>MC</span>
                        </span> : null}
                    {typeof ratings.rt === 'number' ?
                        <span className={classnames(styles['sub-item'], styles['rating'])}>
                            {ratings.rt}%
                            <span className={styles['rt-badge']}>RT</span>
                        </span> : null}
                    {genresText ?
                        <span className={classnames(styles['sub-item'], styles['genres'])}>{genresText}</span> : null}
                </div>
                {
                    typeof meta.description === 'string' && meta.description.length > 0 ?
                        <div className={styles['hero-description']}>{meta.description}</div>
                        : null
                }
                {
                    directorText || castText ?
                        <div className={styles['hero-cast']}>
                            {directorText ?
                                <span className={styles['hero-credit']}>
                                    <span className={styles['hero-credit-label']}>Regista</span>{directorText}
                                </span>
                                : null}
                            {directorText && castText ?
                                <span className={styles['hero-credit-sep']} aria-hidden={true} />
                                : null}
                            {castText ?
                                <span className={styles['hero-credit']}>
                                    <span className={styles['hero-credit-label']}>Cast</span>{castText}
                                </span>
                                : null}
                        </div>
                        : null
                }
            </div>
        </div>
    );
};

BoardHero.propTypes = {
    meta: PropTypes.object,
};

module.exports = BoardHero;
