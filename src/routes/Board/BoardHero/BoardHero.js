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

const isMetaThin = (m) => !m || (
    !m.description && (!Array.isArray(m.genres) || m.genres.length === 0) &&
    (!Array.isArray(m.cast) || m.cast.length === 0)
);

const useEnrichedMeta = (meta) => {
    const [enriched, setEnriched] = React.useState(meta);
    React.useEffect(() => {
        setEnriched(meta);
        if (!meta || !isMetaThin(meta) || !meta.id || !meta.type) return undefined;
        // Solo id imdb-style (tt...) o kitsu:123 — cinemeta gestisce questi.
        if (!/^(tt\d+|kitsu:)/.test(String(meta.id))) return undefined;
        const cacheKey = meta.type + ':' + meta.id;
        if (metaCache.has(cacheKey)) {
            setEnriched({ ...meta, ...metaCache.get(cacheKey) });
            return undefined;
        }
        let cancelled = false;
        fetch(CINEMETA + encodeURIComponent(meta.type) + '/' + encodeURIComponent(meta.id) + '.json')
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (cancelled || !data || !data.meta) return;
                const { description, genres, cast, imdbRating, releaseInfo, runtime, background, logo, videos } = data.meta;
                const enrichment = { description, genres, cast, imdbRating, releaseInfo, runtime, background, logo, videos };
                metaCache.set(cacheKey, enrichment);
                if (metaCache.size > MAX_CACHE) {
                    const first = metaCache.keys().next().value;
                    metaCache.delete(first);
                }
                setEnriched({ ...meta, ...enrichment });
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [meta]);
    return enriched;
};

const BoardHero = ({ meta: rawMeta }) => {
    const meta = useEnrichedMeta(rawMeta);
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
                        :
                        <div className={styles['hero-title']}>{meta.name}</div>
                }
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
