// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { useTranslation } = require('react-i18next');
const NavTabButton = require('./NavTabButton');
const styles = require('./styles');

const VerticalNavBar = React.memo(({ className, selected, tabs, bottomSlot }) => {
    const { t } = useTranslation();
    return (
        <nav className={classnames(className, styles['vertical-nav-bar-container'])}>
            {
                Array.isArray(tabs) ?
                    tabs.map((tab, index) => (
                        <NavTabButton
                            key={index}
                            className={styles['nav-tab-button']}
                            selected={tab.id === selected}
                            href={tab.href}
                            logo={tab.logo}
                            icon={tab.icon}
                            label={t(tab.label)}
                            onClick={tab.onClick}
                        />
                    ))
                    :
                    null
            }
            {
                bottomSlot ?
                    <div className={styles['bottom-slot']}>{bottomSlot}</div>
                    :
                    null
            }
        </nav>
    );
});

VerticalNavBar.displayName = 'VerticalNavBar';

VerticalNavBar.propTypes = {
    className: PropTypes.string,
    selected: PropTypes.string,
    tabs: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        label: PropTypes.string,
        logo: PropTypes.string,
        icon: PropTypes.string,
        href: PropTypes.string,
        onClick: PropTypes.func
    })),
    bottomSlot: PropTypes.node
};

module.exports = VerticalNavBar;
