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

    return (
        <div className={classnames(className, styles['seasons-bar-container'])}>
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
