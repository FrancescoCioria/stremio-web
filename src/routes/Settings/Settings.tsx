// Copyright (C) 2017-2023 Smart code 203358507

import React, { useCallback, useRef } from 'react';
import classnames from 'classnames';
import { usePlatform, useProfile, useStreamingServer, withCoreSuspender } from 'stremio/common';
import { MainNavBars } from 'stremio/components';
import Interface from './Interface';
import Player from './Player';
import Streaming from './Streaming';
import Shortcuts from './Shortcuts';
import Info from './Info';
import { CASA_VERSION } from 'stremio/casaVersion';
import styles from './Settings.less';

// Casa TV: Settings semplificato. Niente menu sezioni (General/Interface/...):
// da TV era solo attrito (serviva una doppia ← per rientrarci, ndr). E niente
// sezione General (login/logout, Trakt, Discord, ToS... roba di setup, non
// d'uso quotidiano). Restano i controlli utili (Interface/Player/Streaming/
// Shortcuts) + Info con le versioni (incl. riga Casa). Si naviga tra sezioni
// scorrendo su/giu'; ← da un controllo esce dritto alla barra app.
const Settings = () => {
    const profile = useProfile();
    const platform = usePlatform();
    const streamingServer = useStreamingServer();
    const sectionsContainerRef = useRef<HTMLDivElement>(null);

    // ← da un controllo → barra app (sidebar). I tab della sidebar sono
    // tabIndex=-1, quindi la spatial-nav (polyfill) non li raggiunge: serve il
    // bridge esplicito (stesso pattern di Board/Library/Search). Non rubiamo ←
    // a input di testo / slider / dropdown aperti, dove la freccia ha senso suo.
    const onContentKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'ArrowLeft') return;
        const target = event.target as HTMLElement;
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (target.isContentEditable) return;
        if (target.getAttribute('role') === 'slider') return;
        if (target.closest('[class*="menu-container"]')) return;
        const navBar = document.querySelector('[class*="vertical-nav-bar-container"]');
        const selectedTab = navBar && (
            navBar.querySelector('[class*="nav-tab-button-container"].selected')
            || navBar.querySelector('[class*="nav-tab-button-container"]')
        );
        if (selectedTab) {
            event.preventDefault();
            event.stopPropagation();
            (selectedTab as HTMLElement).focus({ preventScroll: true });
        }
    }, []);

    // TV: tieni il controllo in focus a META' schermo (non incollato in cima =
    // illeggibile). La spatial-nav porta il focus ma lo scrolla in alto; qui lo
    // ri-centriamo a ogni focusin dentro la lista.
    const onSectionFocus = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }, []);

    return (
        <MainNavBars className={styles['settings-container']} route={'settings'}>
            <div className={classnames(styles['settings-content'], 'animation-fade-in')} onKeyDown={onContentKeyDown}>
                <div ref={sectionsContainerRef} className={styles['sections-container']} onFocus={onSectionFocus}>
                    <Interface profile={profile} />
                    <Player profile={profile} />
                    <Streaming
                        profile={profile}
                        streamingServer={streamingServer}
                    />
                    {
                        !platform.isMobile && <Shortcuts />
                    }
                    <Info streamingServer={streamingServer} />
                </div>
                {/* Badge versione Casa SEMPRE visibile (radar anti-cache stale):
                    se l'hash non corrisponde all'ultimo deploy, la tile sta
                    servendo un bundle vecchio dal service worker. Le versioni
                    complete restano in Info, in fondo. */}
                <div
                    title={`Casa ${CASA_VERSION} · ${process.env.COMMIT_HASH}`}
                    style={{ position: 'fixed', bottom: '0.7rem', right: '1.1rem', zIndex: 9, fontSize: '1.1rem', fontWeight: 'bold', color: '#fff', opacity: 0.9, textShadow: '0 1px 3px rgba(0,0,0,0.8)', pointerEvents: 'none', fontFamily: 'monospace' }}
                >
                    {'Casa'}: {CASA_VERSION} · {(process.env.COMMIT_HASH || '').slice(0, 7)}
                </div>
            </div>
        </MainNavBars>
    );
};

const SettingsFallback = () => (
    <MainNavBars className={styles['settings-container']} route={'settings'} />
);

export default withCoreSuspender(Settings, SettingsFallback);
