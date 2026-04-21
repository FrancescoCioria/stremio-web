// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { useTranslation } = require('react-i18next');
const NavTabButton = require('./NavTabButton');
const styles = require('./styles');

const VerticalNavBar = React.memo(({ className, selected, tabs, bottomSlot }) => {
    const { t } = useTranslation();
    const navRef = React.useRef(null);

    // TV: navigazione tra i tab con ArrowUp/Down + ritorno al contenuto
    // con ArrowRight. I NavTabButton hanno tabIndex=-1 quindi li focussiamo
    // programmaticamente.
    const onKeyDown = React.useCallback((e) => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowRight'].includes(e.key)) return;
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            // Trova il content-container sibling e focussa il primo
            // focusable al suo interno (tipicamente la prima card).
            const container = navRef.current?.parentElement;
            const content = container?.querySelector('[class*="nav-content-container"]');
            if (content) {
                const target = content.querySelector('[class*="meta-item-container"]')
                    || content.querySelector('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
                if (target) target.focus({ preventScroll: true });
            }
            return;
        }
        const focusables = [...navRef.current.querySelectorAll('a[href], [class*="profile-button"]')];
        const current = focusables.indexOf(document.activeElement);
        if (current < 0) return;
        const next = e.key === 'ArrowDown' ? focusables[current + 1] : focusables[current - 1];
        if (!next) return;
        e.preventDefault();
        e.stopPropagation();
        next.focus({ preventScroll: true });
    }, []);

    return (
        <nav ref={navRef} className={classnames(className, styles['vertical-nav-bar-container'])} onKeyDown={onKeyDown}>
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
