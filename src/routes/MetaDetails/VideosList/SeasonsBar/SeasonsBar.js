// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { t } = require('i18next');
const { Button } = require('stremio/components');
const SeasonsBarPlaceholder = require('./SeasonsBarPlaceholder');
const styles = require('./styles');

// TV layout: pill per ogni season, niente piu' prev/next ne' dropdown.
// Focus su una pill con frecce + Enter per selezionare.
const SeasonsBar = ({ className, seasons, season, onSelect }) => {
    const rootRef = React.useRef(null);
    const pillOnClick = React.useCallback((event) => {
        if (typeof onSelect !== 'function') return;
        const value = Number(event.currentTarget.dataset.season);
        onSelect({
            type: 'select',
            value,
            reactEvent: event,
            nativeEvent: event.nativeEvent,
        });
    }, [onSelect]);

    // TV: filtraggio live al focus. L'utente muove il focus tra le
    // pill con le frecce → il season cambia subito senza dover
    // confermare con Enter.
    const pillOnFocus = React.useCallback((event) => {
        if (typeof onSelect !== 'function') return;
        const value = Number(event.currentTarget.dataset.season);
        onSelect({
            type: 'select',
            value,
            reactEvent: event,
            nativeEvent: event.nativeEvent,
        });
    }, [onSelect]);

    const onKeyDown = React.useCallback((e) => {
        const root = rootRef.current;
        if (!root) return;
        if (e.key === 'ArrowDown') {
            // Vai alla prima card episodio nel VideosList sottostante.
            const content = root.closest('[class*="metadetails-content"]') || root.parentElement?.parentElement;
            const videoCard = content?.querySelector('[class*="videos-container"] [data-video-id] [tabindex], [class*="videos-container"] [data-video-id] a, [class*="videos-container"] [data-video-id] button');
            if (!videoCard) return;
            e.preventDefault();
            e.stopPropagation();
            videoCard.focus({ preventScroll: true });
            return;
        }
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const current = e.target.closest('button');
        if (!current) return;
        const target = e.key === 'ArrowRight' ? current.nextElementSibling : current.previousElementSibling;
        if (!target || target.tagName !== 'BUTTON') return;
        e.preventDefault();
        e.stopPropagation();
        target.focus({ preventScroll: true });
        target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, []);

    return (
        <div ref={rootRef} onKeyDown={onKeyDown} className={classnames(className, styles['seasons-bar-container'])}>
            {seasons.map((s) => {
                const label = s > 0 ? t('SEASON_NUMBER', { season: s }) : t('SPECIAL');
                const active = s === season;
                return (
                    <Button
                        key={s}
                        className={classnames(styles['season-pill'], { [styles['active']]: active })}
                        title={label}
                        data-season={s}
                        onClick={pillOnClick}
                        onFocus={pillOnFocus}
                    >
                        <div className={styles['label']}>{label}</div>
                    </Button>
                );
            })}
        </div>
    );
};

SeasonsBar.Placeholder = SeasonsBarPlaceholder;

SeasonsBar.propTypes = {
    className: PropTypes.string,
    seasons: PropTypes.arrayOf(PropTypes.number).isRequired,
    season: PropTypes.number.isRequired,
    onSelect: PropTypes.func
};

module.exports = SeasonsBar;
