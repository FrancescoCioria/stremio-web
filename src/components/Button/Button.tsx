// Copyright (C) 2017-2023 Smart code 203358507

import { createElement, forwardRef, useCallback } from 'react';
import classNames from 'classnames';
import { LongPressEventType, useLongPress } from 'use-long-press';
import styles from './Button.less';

type Props = {
    className?: string,
    style?: object,
    href?: string,
    target?: string
    download?: string,
    title?: string,
    disabled?: boolean,
    tabIndex?: number,
    children: React.ReactNode,
    onKeyDown?: (event: React.KeyboardEvent) => void,
    onMouseDown?: (event: React.MouseEvent) => void,
    onMouseUp?: (event: React.MouseEvent) => void,
    onMouseLeave?: (event: React.MouseEvent) => void,
    onLongPress?: () => void,
    onClick?: (event: React.MouseEvent<HTMLDivElement>) => void,
    onDoubleClick?: () => void,
};

const Button = forwardRef(({ className, href, disabled, children, onLongPress, onDoubleClick, ...props }: Props, ref) => {
    const longPress = useLongPress(onLongPress!, { detect: LongPressEventType.Pointer });

    const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (typeof props.onKeyDown === 'function') {
            props.onKeyDown(event);
        }

        // Casa: SPAZIO = INVIO = l'OK del telecomando (richiesta dell'utente,
        // 2026-09-21: sul Mac la barra spaziatrice non faceva niente su un
        // pulsante, anzi faceva scorrere la pagina sotto). ⚠️ Non se il tasto
        // parte da un campo di testo: nella ricerca lo spazio deve SCRIVERE.
        // Checkbox e RadioButton lo facevano gia' per conto loro.
        const target = event.target as HTMLElement;
        const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
        if (event.key === 'Enter' || (event.key === ' ' && !typing)) {
            event.preventDefault();
            // @ts-expect-error: Property 'buttonClickPrevented' does not exist on type 'KeyboardEvent'.
            if (!event.nativeEvent.buttonClickPrevented) {
                event.currentTarget.click();
            }
        }
    }, [props.onKeyDown]);

    const onMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (typeof props.onMouseDown === 'function') {
            props.onMouseDown(event);
        }

        // @ts-expect-error: Property 'buttonBlurPrevented' does not exist on type 'MouseEvent'.
        if (!event.nativeEvent.buttonBlurPrevented) {
            event.preventDefault();
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
        }
    }, [props.onMouseDown]);

    return createElement(
        typeof href === 'string' && href.length > 0 ? 'a' : 'div',
        {
            tabIndex: 0,
            ...props,
            ref,
            className: classNames(className, styles['button-container'], { 'disabled': disabled }),
            href,
            onKeyDown,
            onMouseDown,
            onDoubleClick,
            ...longPress()
        },
        children
    );
});

export default Button;

