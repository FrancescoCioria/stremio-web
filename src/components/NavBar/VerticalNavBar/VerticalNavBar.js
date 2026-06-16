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
            // Trova il content-container sibling e focussa la card piu'
            // vicina a vista. NON la prima in DOM-order: se l'utente ha
            // scrollato la lista, la prima card e' fuori schermo sopra →
            // entrando nel contenuto il focus sparirebbe off-viewport.
            // Spatial: tra le card visibili (intersezione col viewport del
            // content, sia verticale che orizzontale) scegliamo la
            // top-most/left-most = quella in alto a sinistra di cio' che si
            // vede. Fallback: prima card / primo focusable.
            const container = navRef.current?.parentElement;
            const content = container?.querySelector('[class*="nav-content-container"]');
            if (content) {
                const items = [...content.querySelectorAll('[class*="meta-item-container"]')];
                let target = null;
                if (items.length) {
                    // Viewport REALE = il contenitore scrollabile che clippa
                    // le card (board-content, sotto il BoardHero; o il grid
                    // della Library), NON nav-content-container che parte da
                    // sopra l'header. Una riga scrollata dietro l'header ha
                    // top < scroller.top e va esclusa: altrimenti, essendo la
                    // top-most, la sceglieremmo pur essendo nascosta.
                    let scroller = items[0].parentElement;
                    while (scroller && scroller !== content) {
                        const oy = getComputedStyle(scroller).overflowY;
                        if (oy === 'auto' || oy === 'scroll') break;
                        scroller = scroller.parentElement;
                    }
                    const vpRect = (scroller || content).getBoundingClientRect();
                    // Il BoardHero e' position:absolute SOPRA lo scroller e ne
                    // copre la parte alta: una riga scrollata sotto vpRect.top
                    // ma dietro l'hero e' di fatto nascosta. Clippa il top
                    // visibile al bottom dell'hero (se copre il top dello
                    // scroller). Senza, sceglieremmo la riga dietro l'header.
                    let vpTop = vpRect.top;
                    const hero = content.querySelector('[class*="hero"]');
                    if (hero) {
                        const hr = hero.getBoundingClientRect();
                        if (hr.top <= vpRect.top + 2 && hr.bottom > vpRect.top + 2) {
                            vpTop = Math.max(vpTop, hr.bottom);
                        }
                    }
                    const vp = { top: vpTop, bottom: vpRect.bottom, left: vpRect.left, right: vpRect.right };
                    const pickTopLeft = (pool) => pool.reduce((best, el) => {
                        if (!best) return el;
                        const r = el.getBoundingClientRect();
                        const br = best.getBoundingClientRect();
                        if (Math.abs(r.top - br.top) > 4) return r.top < br.top ? el : best;
                        return r.left < br.left ? el : best;
                    }, null);
                    // Card col top dentro la finestra visibile (non clippato
                    // sopra) e on-screen orizzontalmente.
                    const visible = items.filter((el) => {
                        const r = el.getBoundingClientRect();
                        return r.top >= vp.top - 4 && r.top < vp.bottom - 1
                            && r.right > vp.left + 1 && r.left < vp.right - 1;
                    });
                    if (visible.length) {
                        target = pickTopLeft(visible);
                    } else {
                        // Nessuna riga col top in vista: prendi quella col top
                        // piu' vicino al top visibile (nearest-to-view).
                        target = items.reduce((best, el) => {
                            if (!best) return el;
                            const d = Math.abs(el.getBoundingClientRect().top - vp.top);
                            const bd = Math.abs(best.getBoundingClientRect().top - vp.top);
                            return d < bd ? el : best;
                        }, null);
                    }
                }
                if (!target) {
                    target = content.querySelector('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
                }
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
