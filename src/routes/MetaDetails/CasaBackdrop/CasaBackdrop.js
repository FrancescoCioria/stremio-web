// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: lo sfondo della pagina serie con DISSOLVENZA fra un'immagine e
// l'altra (handoff Claude Design: "cross-fade the backdrop ... over ~400ms
// ease-out; debounce ~250ms so fast D-pad traversal doesn't thrash").
// Quale immagine: common/casaBackdrop.js.
//
// ⚠️ La nuova immagine entra solo quando e' GIA' DECODIFICATA (`img.decode()`):
// scambiarla prima avrebbe dato un lampo di sfondo vuoto o uno scatto.
// Se il caricamento fallisce si resta sull'immagine di prima (mai sfondo nero).
// ⚠️ La foto dell'episodio e' w1280 (~134 KB), non l'originale: vedi
// common/casaBackdrop.js.
// ⚠️ Debounce: una raffica di frecce sulle card non carica dieci foto, carica
// quella dove ci si ferma.

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const styles = require('./styles');

const DEBOUNCE_MS = 250;

const CasaBackdrop = ({ className, src, imageClassName }) => {
    // Strati impilati: ognuno sa se sta ancora ENTRANDO (flag suo, non la
    // posizione nella lista). ⚠️ Decidere "entra chi e' in cima" faceva
    // scattare a piena opacita' uno strato a meta' dissolvenza quando ne
    // arrivava un altro (nav a ~300 ms su foto in cache). Quando uno strato
    // finisce di entrare copre tutto: quelli sotto si tolgono (restavano
    // decodificati e composti per sempre, invisibili).
    const [layers, setLayers] = React.useState(() => (src ? [{ src, key: 0, entering: false }] : []));
    const shownRef = React.useRef(src || null);
    React.useEffect(() => {
        if (!src || src === shownRef.current) return;
        let cancelled = false;
        let img = null;
        const timer = setTimeout(() => {
            img = new window.Image();
            img.src = src;
            const ready = typeof img.decode === 'function' ? img.decode() : new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            ready.then(() => {
                if (cancelled) return;
                shownRef.current = src;
                setLayers((prev) => {
                    const last = prev[prev.length - 1];
                    return [...prev, { src, key: (last ? last.key : 0) + 1, entering: true }];
                });
            }).catch(() => { /* si resta sull'immagine di prima */ });
        }, shownRef.current === null ? 0 : DEBOUNCE_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            // ⚠️ Una foto che non serve piu' non si finisce di scaricare: sotto
            // la pagina torrent la banda serve al torrent che sta partendo.
            if (img !== null) img.src = '';
        };
    }, [src]);
    const onEntered = React.useCallback((key) => {
        setLayers((prev) => {
            const idx = prev.findIndex((layer) => layer.key === key);
            if (idx === -1) return prev;
            return prev.slice(idx).map((layer, i) => (i === 0 ? { ...layer, entering: false } : layer));
        });
    }, []);
    return (
        <div className={classnames(className, styles['casa-backdrop'])}>
            {layers.map((layer) => (
                <img
                    key={layer.key}
                    className={classnames(imageClassName, styles['layer'], { [styles['entering']]: layer.entering })}
                    src={layer.src}
                    alt={' '}
                    onAnimationEnd={layer.entering ? () => onEntered(layer.key) : undefined}
                />
            ))}
        </div>
    );
};

CasaBackdrop.propTypes = {
    className: PropTypes.string,
    imageClassName: PropTypes.string,
    src: PropTypes.string,
};

module.exports = CasaBackdrop;
