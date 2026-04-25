// Copyright (C) 2024 — Casa TV fork
// Hero top della Board che mostra info dell'item FOCUSATO nelle rail.
// Ispirato dal layout Android TV: titolo grande left, background-art right,
// runtime/year/rating, genres, description, cast. Niente pulsanti (sono su
// MetaDetails quando cliccato).

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { Image } = require('stremio/components');
const styles = require('./styles');

// Cache meta arricchiti da cinemeta (CW items hanno solo poster+name+id,
// mancano description/genres/cast/rating). Modulo-level = sopravvive
// tra focus switch, evita re-fetch. Max 50 entry ruotate FIFO.
const metaCache = new Map();
const MAX_CACHE = 50;
const CINEMETA = 'https://v3-cinemeta.strem.io/meta/';

// Enrichment se manca almeno uno dei campi mostrati dall'hero. Le rail
// Featured (Cinemeta) mandano tutto inline; altri addon spesso mandano
// description+genres ma omettono rating/runtime/releaseInfo/background
// — l'hero mostrerebbe solo titolo + cast se non li fetchassimo.
const needsEnrichment = (m) => !m || (
    !m.imdbRating || !m.runtime || !m.releaseInfo || !m.description ||
    !m.background || !m.logo ||
    (!Array.isArray(m.genres) || m.genres.length === 0) ||
    (!Array.isArray(m.cast) || m.cast.length === 0)
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
        // Continue Watching items hanno `_id` invece di `id`. Per gli
        // episodi di serie il formato e' `tt12345:1:1` (imdbId:season:ep)
        // — Cinemeta vuole solo il parent. Estraggo la base imdb/kitsu.
        const fullId = meta.id || meta._id;
        const idMatch = fullId ? String(fullId).match(/^(tt\d+|kitsu:\d+)/) : null;
        if (!idMatch) {
            setDone(true);
            return undefined;
        }
        const baseId = idMatch[1];
        const cacheKey = meta.type + ':' + baseId;
        if (metaCache.has(cacheKey)) {
            setEnriched({ ...meta, ...metaCache.get(cacheKey) });
            setDone(true);
            return undefined;
        }
        setDone(false);
        let cancelled = false;
        fetch(CINEMETA + encodeURIComponent(meta.type) + '/' + encodeURIComponent(baseId) + '.json')
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (cancelled) return;
                if (data && data.meta) {
                    const { description, genres, cast, imdbRating, releaseInfo, runtime, background, logo, videos } = data.meta;
                    // Filtra undefined/null cosi' campi gia' presenti
                    // nell'item originale non vengono blankerati dal merge.
                    const enrichment = Object.fromEntries(
                        Object.entries({ description, genres, cast, imdbRating, releaseInfo, runtime, background, logo, videos })
                            .filter(([, v]) => v !== undefined && v !== null)
                    );
                    metaCache.set(cacheKey, enrichment);
                    if (metaCache.size > MAX_CACHE) {
                        const first = metaCache.keys().next().value;
                        metaCache.delete(first);
                    }
                    setEnriched({ ...meta, ...enrichment });
                }
            })
            .catch(() => {})
            .finally(() => { if (!cancelled) setDone(true); });
        return () => { cancelled = true; };
    }, [meta]);
    return { meta: enriched, done };
};

const BoardHero = ({ meta: rawMeta }) => {
    const { meta, done: enrichmentDone } = useEnrichedMeta(rawMeta);
    if (!meta) {
        return <div className={styles['board-hero-container']} />;
    }

    const rating = meta.imdbRating ? `${meta.imdbRating}` : null;
    const genresText = Array.isArray(meta.genres) ? meta.genres.slice(0, 3).join(' · ') : null;
    const castText = Array.isArray(meta.cast) ? meta.cast.slice(0, 3).join(', ') : null;
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
                    {typeof meta.runtime === 'string' && meta.runtime.length > 0 ?
                        <span className={styles['sub-item']}>{meta.runtime}</span> : null}
                    {typeof meta.releaseInfo === 'string' && meta.releaseInfo.length > 0 ?
                        <span className={styles['sub-item']}>{meta.releaseInfo}</span> : null}
                    {rating ?
                        <span className={classnames(styles['sub-item'], styles['rating'])}>
                            {rating}
                            <span className={styles['imdb-badge']}>IMDb</span>
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
                    castText ?
                        <div className={styles['hero-cast']}>{castText}</div>
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
