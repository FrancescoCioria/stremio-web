// Copyright (C) 2017-2023 Smart code 203358507

import React, { memo } from 'react';
import classnames from 'classnames';
import { VerticalNavBar } from 'stremio/components/NavBar';
// @ts-ignore – NavMenu e' JS
import NavMenu from 'stremio/components/NavBar/HorizontalNavBar/NavMenu';
// @ts-ignore
import Button from 'stremio/components/Button';
// @ts-ignore
import Icon from '@stremio/stremio-icons/react';
import styles from './MainNavBars.less';

// TV layout: tutti i tab sulla sidebar sinistra (Search in cima, poi
// Home/Library/Settings). Profile (NavMenu popup) ancorato in fondo.
// Nessuna horizontal nav bar in alto.
const TABS = [
    { id: 'search', label: 'Search', icon: 'search', href: '#/search' },
    { id: 'board', label: 'Board', icon: 'home', href: '#/' },
    { id: 'library', label: 'Library', icon: 'library', href: '#/library' },
    { id: 'settings', label: 'SETTINGS', icon: 'settings', href: '#/settings' },
];

type RenderLabelProps = {
    ref?: React.Ref<HTMLElement>;
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
    children?: React.ReactNode;
};

type Props = {
    className: string,
    route?: string,
    query?: string,
    children?: React.ReactNode,
};

const MainNavBars = memo(({ className, route, children }: Props) => {
    const renderProfileLabel = React.useCallback(
        ({ ref, className: popupCls, onClick, children: popupChildren }: RenderLabelProps) => (
            // @ts-ignore – Button accetta ref
            <Button ref={ref} className={classnames(popupCls, styles['profile-button'])} tabIndex={-1} onClick={onClick}>
                <Icon className={styles['profile-icon']} name={'person-outline'} />
                {popupChildren}
            </Button>
        ),
        []
    );
    return (
        <div className={classnames(className, styles['main-nav-bars-container'])}>
            <VerticalNavBar
                className={styles['vertical-nav-bar']}
                selected={route}
                tabs={TABS}
                bottomSlot={<NavMenu renderLabel={renderProfileLabel} direction={'top-right'} />}
            />
            <div className={styles['nav-content-container']}>{children}</div>
        </div>
    );
});

export default MainNavBars;
