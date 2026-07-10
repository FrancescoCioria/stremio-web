// Casa custom (NON upstream): slider 0-60GB step 5 per la "Cache size", al posto
// del dropdown [No caching / 2 / 5 / 10 GiB / Infinite]. Il valore scrive
// settings.cacheSize di server.js, che e' anche il TETTO reale della disk-cache
// di TorrServer (lo legge il prune torrserver-cache-prune.py). Vedi
// docs/stremio-torrserver.md. Re-port ai sync upstream.
//
// Navigazione telecomando: focusabile; ←/→ = -/+ 5GB (consuma il tasto con
// stopPropagation, cosi' NON attiva il bridge ArrowLeft->menu-sezioni di
// Settings.tsx). ↑/↓ passano oltre -> spatial-nav muove alla riga adiacente.
// Per uscire a sinistra verso il menu sezioni si usa una riga non-slider.
// Logica pura (valore, tasti, label) in ./cacheSize.js (testata da jest).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GiB, MAX, bytesToGb, gbLabel, nextGbForKey } from './cacheSize';
import styles from './CacheSizeSlider.less';

type Props = {
    value: number | null,
    onChange: (bytes: number) => void,
};

const CacheSizeSlider = ({ value, onChange }: Props) => {
    const [gb, setGb] = useState(() => bytesToGb(value));
    const gbRef = useRef(gb);
    gbRef.current = gb;
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sincronizza col valore esterno SOLO se non c'e' un nostro update in volo
    // (evita che il round-trip di server.js faccia sfarfallare lo slider).
    useEffect(() => {
        if (timer.current === null) {
            setGb(bytesToGb(value));
        }
    }, [value]);

    const commit = useCallback((nextGb: number) => {
        if (timer.current !== null) {
            clearTimeout(timer.current);
        }
        timer.current = setTimeout(() => {
            timer.current = null;
            onChange(nextGb * GiB);
        }, 500);
    }, [onChange]);

    const onKeyDown = useCallback((event: React.KeyboardEvent) => {
        const next = nextGbForKey(event.key, gbRef.current);
        if (next === null) {
            return; // ↑/↓ e resto -> lascia navigare la spatial-nav
        }
        event.preventDefault();
        event.stopPropagation();
        if (next !== gbRef.current) {
            setGb(next);
            commit(next);
        }
    }, [commit]);

    const pct = (gb / MAX) * 100;
    return (
        <div
            className={styles['cache-slider']}
            tabIndex={0}
            role={'slider'}
            aria-valuemin={0}
            aria-valuemax={MAX}
            aria-valuenow={gb}
            aria-label={'Cache size'}
            onKeyDown={onKeyDown}
        >
            <div className={styles['track']}>
                <div className={styles['fill']} style={{ width: `${pct}%` }} />
            </div>
            <div className={styles['value']}>{gbLabel(gb)}</div>
        </div>
    );
};

export default CacheSizeSlider;
