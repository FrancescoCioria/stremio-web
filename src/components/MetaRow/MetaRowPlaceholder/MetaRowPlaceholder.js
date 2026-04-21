// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const styles = require('./styles');

const PLACEHOLDER_COUNT = 12;

const MetaRowPlaceholder = ({ className, title }) => {
    return (
        <div className={classnames(className, styles['meta-row-placeholder-container'])}>
            <div className={styles['header-container']}>
                <div className={styles['title-container']} title={typeof title === 'string' && title.length > 0 ? title : null}>
                    {typeof title === 'string' && title.length > 0 ? title : null}
                </div>
                {/* TV: see-all rimosso (vedi MetaRow.js). */}
            </div>
            <div className={styles['meta-items-container']}>
                {Array(PLACEHOLDER_COUNT).fill(null).map((_, index) => (
                    <div key={index} className={styles['meta-item']}>
                        <div className={styles['poster-container']} />
                        <div className={styles['title-bar-container']}>
                            <div className={styles['title-label']} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

MetaRowPlaceholder.propTypes = {
    className: PropTypes.string,
    title: PropTypes.string,
};

module.exports = MetaRowPlaceholder;
