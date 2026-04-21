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

const BoardHero = ({ meta }) => {
    if (!meta) {
        return <div className={styles['board-hero-container']} />;
    }

    const rating =
        (meta.imdbRating && `${meta.imdbRating}`) ||
        (meta.releaseInfo ? null : null);
    const genresText = Array.isArray(meta.genres) ? meta.genres.slice(0, 3).join(' · ') : null;
    const castText = Array.isArray(meta.cast) ? meta.cast.slice(0, 3).join(', ') : null;

    return (
        <div className={classnames(styles['board-hero-container'], 'animation-fade-in')}>
            {
                typeof meta.background === 'string' && meta.background.length > 0 ?
                    <div className={styles['hero-bg-layer']}>
                        <Image
                            key={meta.id}
                            className={styles['hero-bg-image']}
                            src={meta.background}
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
