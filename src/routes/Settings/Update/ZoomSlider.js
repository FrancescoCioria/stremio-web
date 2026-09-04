// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa custom (NON upstream): slider "Zoom UI" nella sezione Casa di Settings,
// stesso pattern di Settings/Streaming/CacheSizeSlider (div role=slider,
// ←/→ = -/+ step, consuma il tasto cosi' NON attiva il bridge ArrowLeft->menu
// sezioni di Settings.tsx — che gia' esclude esplicitamente role=slider).
// Logica pura (clamp, step, label) in common/casaUiScale.js, condivisa con
// l'applicazione al boot (App/CasaUiScaleInit.js).

const React = require('react');
const casaUiScale = require('stremio/common/casaUiScale');
const styles = require('./ZoomSlider.less');

const ZoomSlider = () => {
    const scale = React.useSyncExternalStore(casaUiScale.subscribe, casaUiScale.getState);

    const onKeyDown = React.useCallback((event) => {
        const next = casaUiScale.nextScaleForKey(event.key, scale);
        if (next === null) {
            return; // ↑/↓ e resto -> lascia navigare la spatial-nav
        }
        event.preventDefault();
        event.stopPropagation();
        if (next !== scale) {
            casaUiScale.setScale(next);
        }
    }, [scale]);

    const pct = Math.round(
        ((scale - casaUiScale.MIN_SCALE) / (casaUiScale.MAX_SCALE - casaUiScale.MIN_SCALE)) * 100
    );

    return (
        <div
            className={styles['zoom-slider']}
            tabIndex={0}
            role={'slider'}
            aria-valuemin={casaUiScale.MIN_SCALE * 100}
            aria-valuemax={casaUiScale.MAX_SCALE * 100}
            aria-valuenow={Math.round(scale * 100)}
            aria-label={'Zoom UI'}
            onKeyDown={onKeyDown}
        >
            <div className={styles['track']}>
                <div className={styles['fill']} style={{ width: `${pct}%` }} />
            </div>
            <div className={styles['value']}>{casaUiScale.scaleLabel(scale)}</div>
        </div>
    );
};

module.exports = ZoomSlider;
