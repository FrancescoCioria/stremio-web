// Copyright (C) 2017-2026 Smart code 203358507
//
// Banner "Niente internet in casa" sopra a tutta la tile (home, schede, player).
// Logica e perche' in common/casaInternet.js; qui solo il poll e il disegno.
// Non prende mai il focus (pointer-events: none, niente bottoni): il telecomando
// continua a muoversi sotto come prima.

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './styles.less';

const { casaBackendUrl } = require('stremio/common/casaBackend');
const {
    POLL_INTERVAL_MS,
    FETCH_TIMEOUT_MS,
    BACK_ONLINE_MS,
    parseHealth,
    minutesOffline,
    nextBannerState,
} = require('stremio/common/casaInternet');

type BannerState = 'hidden' | 'offline' | 'back';

const readHealth = async () => {
    const url = casaBackendUrl('/system/internet');
    if (!url) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
        if (!res.ok) return null;
        return parseHealth(await res.json());
    } catch (_e) {
        return null;
    } finally {
        clearTimeout(timer);
    }
};

const CasaInternetBanner = () => {
    const { t } = useTranslation();
    const [state, setState] = useState<BannerState>('hidden');
    const [since, setSince] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        let alive = true;
        let unknownStreak = 0;
        const tick = async () => {
            const health = await readHealth();
            if (!alive) return;
            unknownStreak = health === null ? unknownStreak + 1 : 0;
            setNow(Date.now());
            if (health && !health.online) setSince(health.since);
            setState((prev) => nextBannerState(prev, health, unknownStreak));
        };
        void tick();
        const interval = setInterval(() => void tick(), POLL_INTERVAL_MS);
        return () => {
            alive = false;
            clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        if (state !== 'back') return;
        const id = setTimeout(() => setState((s) => (s === 'back' ? 'hidden' : s)), BACK_ONLINE_MS);
        return () => clearTimeout(id);
    }, [state]);

    if (state === 'hidden') return null;

    if (state === 'back') {
        return (
            <div className={styles['casa-internet-banner']} data-casa-internet={'back'}>
                <div className={styles['title']}>{t('CASA_INTERNET_BACK')}</div>
            </div>
        );
    }

    const minutes = minutesOffline(since, now);
    return (
        <div className={styles['casa-internet-banner']} data-casa-internet={'offline'}>
            <div className={styles['title']}>
                {t('CASA_NO_INTERNET')}
                {minutes !== null && minutes > 0 ? ` · ${minutes} ${t('CASA_MINUTES')}` : null}
            </div>
            <div className={styles['detail']}>{t('CASA_NO_INTERNET_DETAIL')}</div>
        </div>
    );
};

export default CasaInternetBanner;
