// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const FocusLock = require('react-focus-lock').default;
const { default: useRouteFocused } = require('stremio/common/useRouteFocused');
const styles = require('./styles');

// Rettangolo in cui il menu puo' davvero essere VISTO: viewport intersecato con
// ogni antenato che ritaglia.
//
// ⚠️ Sostituisce il vecchio `getAnchorElement`, che risaliva fino al primo
// antenato con `overflowY: auto|scroll`. `hidden` RITAGLIA esattamente come
// `auto`, ma non veniva considerato: nella lista episodi nessun antenato ha
// auto|scroll sull'asse Y (la rail ha `overflow-x:auto; overflow-y:hidden`),
// quindi la ricorsione arrivava a `documentElement` e il popup concludeva
// "sotto c'e' tutto lo spazio del mondo". Si apriva verso il basso e veniva
// tagliato da container che ritagliano ma che quella funzione non vedeva.
// Sintomo: menu episodi illeggibile, si vedeva solo la prima voce.
//
// `display: contents` va saltato: non genera box, quindi non ritaglia nulla e
// il suo rect e' tutto zeri (che intersecato azzererebbe l'area).
const getClipRect = (element) => {
    const clip = { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
    let el = element.parentElement;
    while (el && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        if (style.display !== 'contents' &&
            (style.overflowX !== 'visible' || style.overflowY !== 'visible')) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                clip.top = Math.max(clip.top, rect.top);
                clip.left = Math.max(clip.left, rect.left);
                clip.bottom = Math.min(clip.bottom, rect.bottom);
                clip.right = Math.min(clip.right, rect.right);
            }
        }
        el = el.parentElement;
    }
    return clip;
};

const Popup = ({ open, direction, renderLabel, renderMenu, dataset, onCloseRequest, ...props }) => {
    const routeFocused = useRouteFocused();
    const labelRef = React.useRef(null);
    const menuRef = React.useRef(null);
    const [autoDirection, setAutoDirection] = React.useState(null);
    // Posizione forzata: valorizzata SOLO quando il menu non entra ne' sopra ne'
    // sotto la label dentro l'area non ritagliata. null = comportamento storico.
    // ⚠️ Va passata da `lockProps`, NON come prop `style` di FocusLock: quello
    // inoltra `className` al wrapper ma NON `style`, che sparisce senza un
    // errore — il menu resta tagliato e sembra che il fix non funzioni.
    const [clampedStyle, setClampedStyle] = React.useState(null);
    const menuOnMouseDown = React.useCallback((event) => {
        event.nativeEvent.closePopupPrevented = true;
    }, []);
    React.useEffect(() => {
        const onCloseEvent = (event) => {
            if (!event.closePopupPrevented && typeof onCloseRequest === 'function') {
                const closeEvent = {
                    type: 'close',
                    nativeEvent: event,
                    dataset: dataset
                };
                switch (event.type) {
                    case 'keydown':
                        if (event.code === 'Escape') {
                            onCloseRequest(closeEvent);
                        }
                        break;
                    case 'mousedown':
                        if (event.target !== document.documentElement && !labelRef.current.contains(event.target)) {
                            onCloseRequest(closeEvent);
                        }
                        break;
                    case 'pointerdown':
                        if (event.target !== document.documentElement && !labelRef.current.contains(event.target)) {
                            onCloseRequest(closeEvent);
                        }
                        break;
                }
            }
        };
        if (routeFocused && open) {
            window.addEventListener('keydown', onCloseEvent);
            window.addEventListener('mousedown', onCloseEvent);
            window.addEventListener('pointerdown', onCloseEvent);
        }
        return () => {
            window.removeEventListener('keydown', onCloseEvent);
            window.removeEventListener('mousedown', onCloseEvent);
            window.removeEventListener('pointerdown', onCloseEvent);
        };
    }, [routeFocused, open, onCloseRequest, dataset]);
    React.useLayoutEffect(() => {
        if (open) {
            const autoDirection = [];
            const clip = getClipRect(labelRef.current);

            const labelRect = labelRef.current.getBoundingClientRect();
            const menuRect = menuRef.current.getBoundingClientRect();
            const labelPosition = {
                left: labelRect.left - clip.left,
                top: labelRect.top - clip.top,
                right: clip.right - labelRect.right,
                bottom: clip.bottom - labelRect.bottom
            };

            if (menuRect.height <= labelPosition.bottom) {
                autoDirection.push('bottom');
            } else if (menuRect.height <= labelPosition.top) {
                autoDirection.push('top');
            } else if (labelPosition.bottom >= labelPosition.top) {
                autoDirection.push('bottom');
            } else {
                autoDirection.push('top');
            }

            // ⚠️ Non entra ne' sopra ne' sotto: senza questo il menu resta
            // tagliato e basta (era il caso della lista episodi — card alta 265px
            // in un container di 335px: 35px liberi da entrambe le parti contro
            // un menu di 138px). Lo si fa RIENTRARE nell'area visibile, anche a
            // costo di sovrapporlo alla card: un menu che copre il contenuto e'
            // normale, uno illeggibile no.
            // Lo stile inline si applica SOLO in questo caso: dove il menu ci
            // stava gia', il posizionamento resta quello di prima, invariato.
            const fitsSomewhere = menuRect.height <= Math.max(labelPosition.top, labelPosition.bottom);
            if (!fitsSomewhere) {
                // ⚠️ Margine di sicurezza, non estetica: l'offset e' relativo alla
                // LABEL, e fra la misura e il render la label puo' spostarsi di
                // un paio di px (misurato: menu 2px oltre il bordo a 1512x860).
                // Appoggiato esattamente sul bordo, un menu sembra tagliato anche
                // quando non lo e'.
                const INSET = 4;
                const maxHeight = Math.max(0, (clip.bottom - clip.top) - INSET * 2);
                const height = Math.min(menuRect.height, maxHeight);
                // coordinate viewport -> offset rispetto alla label, che e' il
                // contenitore posizionato del menu (`.label-container` e' relative)
                const top = Math.min(
                    Math.max(labelRect.bottom, clip.top + INSET),
                    clip.bottom - INSET - height
                );
                setClampedStyle({
                    top: Math.floor(top - labelRect.top),
                    bottom: 'auto',
                    maxHeight: Math.floor(maxHeight),
                    overflowY: 'auto',
                });
            } else {
                setClampedStyle(null);
            }

            if (menuRect.width <= (labelPosition.right + labelRect.width)) {
                autoDirection.push('right');
            } else if (menuRect.width <= (labelPosition.left + labelRect.width)) {
                autoDirection.push('left');
            } else if (labelPosition.right > labelPosition.left) {
                autoDirection.push('right');
            } else {
                autoDirection.push('left');
            }

            setAutoDirection(autoDirection.join('-'));
        } else {
            setAutoDirection(null);
            setClampedStyle(null);
        }
    }, [open]);
    return renderLabel({
        ...props,
        ref: labelRef,
        className: classnames(styles['label-container'], props.className, { 'active': open }),
        children: open ?
            <FocusLock ref={menuRef} className={classnames(styles['menu-container'], { [styles[`menu-direction-${autoDirection}`]]: !direction }, { [styles[`menu-direction-${direction}`]]: direction })} autoFocus={false} lockProps={{ onMouseDown: menuOnMouseDown, style: clampedStyle || undefined }}>
                {renderMenu()}
            </FocusLock>
            :
            null
    });
};

Popup.propTypes = {
    open: PropTypes.bool,
    direction: PropTypes.oneOf(['top-left', 'bottom-left', 'top-right', 'bottom-right']),
    renderLabel: PropTypes.func.isRequired,
    renderMenu: PropTypes.func.isRequired,
    dataset: PropTypes.object,
    onCloseRequest: PropTypes.func
};

module.exports = Popup;
