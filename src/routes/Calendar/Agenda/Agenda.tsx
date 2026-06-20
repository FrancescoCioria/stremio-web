// Copyright (C) 2017-2024 Smart code 203358507

import React, { useMemo, useRef } from 'react';
import classNames from 'classnames';
import { useNavigateWithOrigin } from 'stremio-router';
// @ts-ignore – components e' JS
import { Button, Image } from 'stremio/components';
import { useTranslation } from 'react-i18next';
import styles from './Agenda.less';

type Props = {
    // null = caricamento in corso; [] = nessun episodio in arrivo
    items: CalendarItem[] | null,
    profile: Profile,
};

// Id della serie dall'id episodio ("tt123:5:1" -> "tt123").
const seriesId = (ep: CalendarContentItem): string => (ep.id || '').split(':')[0] || ep.id;

type DayCard = {
    key: string,
    name: string,
    poster?: string,
    season?: number,
    episodes: number[],   // episodi dello stesso giorno per quella serie+stagione
    deepLink: string,
};

// Raggruppa gli episodi dello stesso giorno per serie+stagione: uno show che
// rilascia tutta la stagione in un colpo (es. The Bear) diventa UNA card.
const collapseDay = (items: CalendarContentItem[]): DayCard[] => {
    const byKey = new Map<string, DayCard>();
    const order: DayCard[] = [];
    for (const ep of items) {
        const key = `${seriesId(ep)}:${ep.season ?? ''}`;
        let card = byKey.get(key);
        if (!card) {
            card = {
                key,
                name: ep.name,
                poster: ep.poster,
                season: ep.season,
                episodes: [],
                deepLink: ep.deepLinks.metaDetailsStreams,
            };
            byKey.set(key, card);
            order.push(card);
        }
        if (typeof ep.episode === 'number') card.episodes.push(ep.episode);
    }
    return order;
};

const CARD_SELECTOR = '[class*="episode-card"]';

const Agenda = ({ items, profile }: Props) => {
    const { t } = useTranslation();
    const { navigateWithOrigin } = useNavigateWithOrigin();
    const lang = profile?.settings?.interfaceLanguage || 'en-US';
    const rootRef = useRef<HTMLDivElement>(null);
    const initialFocusRef = useRef(false);

    const today = useMemo(() => {
        const d = new Date();
        return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
    }, []);

    const formatDate = (date: CalendarDate): string => {
        const d = new Date(date.year, date.month - 1, date.day);
        const opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
        if (date.year !== today.year) opts.year = 'numeric';
        return d.toLocaleDateString(lang, opts);
    };

    const onCardClick = (event: React.MouseEvent, target: string) => {
        event.preventDefault();
        event.stopPropagation();
        navigateWithOrigin(target);
    };

    // Scroll manuale che tiene la card sotto l'header-data sticky (non coperta).
    const revealCard = (card: HTMLElement) => {
        const root = rootRef.current;
        if (!root) return;
        const headerH = card.closest('[class*="day-group"]')
            ?.querySelector<HTMLElement>('[class*="day-header"]')?.offsetHeight ?? 48;
        const r = card.getBoundingClientRect();
        const rootR = root.getBoundingClientRect();
        const topLimit = rootR.top + headerH;
        if (r.top < topLimit) {
            root.scrollBy({ top: r.top - topLimit - 8, behavior: 'smooth' });
        } else if (r.bottom > rootR.bottom) {
            root.scrollBy({ top: r.bottom - rootR.bottom + 12, behavior: 'smooth' });
        }
    };

    const focusSidebar = (): boolean => {
        const navBar = document.querySelector('[class*="vertical-nav-bar-container"]');
        const tab = navBar?.querySelector<HTMLElement>('[class*="nav-tab-button-container"].selected')
            || navBar?.querySelector<HTMLElement>('[class*="nav-tab-button-container"]');
        if (tab) {
            tab.focus({ preventScroll: true });
            return true;
        }
        return false;
    };

    // Nav col telecomando (frecce = keydown). L'agenda POSSIEDE la nav
    // verticale: Up/Down consumati SEMPRE (preventDefault+stopPropagation) cosi'
    // lo spatial-navigation-polyfill non ruba il focus alla sidebar. Left =
    // torna al menu (single column, sempre). Pattern preso da Board.js.
    const onKeyDown = (e: React.KeyboardEvent) => {
        const isVertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
        const isHorizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
        if (!isVertical && !isHorizontal) return;
        if (isVertical) { e.preventDefault(); e.stopPropagation(); }

        const root = rootRef.current;
        if (!root) return;

        if (e.key === 'ArrowLeft') {
            if (focusSidebar()) { e.preventDefault(); e.stopPropagation(); }
            return;
        }
        if (e.key === 'ArrowRight') {
            // single column: niente a destra, consuma per non far vagare il polyfill
            e.preventDefault(); e.stopPropagation();
            return;
        }

        const cards = Array.from(root.querySelectorAll<HTMLElement>(CARD_SELECTOR));
        if (cards.length === 0) return;
        const current = (e.target as HTMLElement).closest<HTMLElement>(CARD_SELECTOR);
        const idx = current ? cards.indexOf(current) : -1;
        const target = e.key === 'ArrowDown' ? cards[idx + 1] : cards[idx - 1];
        if (!target) return;
        target.focus({ preventScroll: true });
        revealCard(target);
    };

    // Focus iniziale sulla prima card quando i dati arrivano (cosi' le frecce
    // funzionano subito). Non sovrascrive se l'utente ha gia' un focus dentro.
    React.useEffect(() => {
        if (initialFocusRef.current) return;
        if (!items || items.length === 0) return;
        const root = rootRef.current;
        if (!root) return;
        const ae = document.activeElement as HTMLElement | null;
        if (ae && root.contains(ae) && ae.closest(CARD_SELECTOR)) {
            initialFocusRef.current = true;
            return;
        }
        const first = root.querySelector<HTMLElement>(CARD_SELECTOR);
        if (first) {
            initialFocusRef.current = true;
            first.focus({ preventScroll: true });
        }
    }, [items]);

    if (items === null) {
        return (
            <div className={styles['agenda']}>
                {[0, 1, 2].map((i) => (
                    <div className={styles['day-group']} key={i}>
                        <div className={classNames(styles['day-header'], styles['placeholder'])} />
                        <div className={styles['day-cards']}>
                            <div className={classNames(styles['episode-card'], styles['placeholder'])} />
                            <div className={classNames(styles['episode-card'], styles['placeholder'])} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className={styles['agenda']}>
                <div className={styles['empty']}>
                    {t('CALENDAR_NO_NEW_EPISODES', { defaultValue: 'Nessun nuovo episodio in arrivo' })}
                </div>
            </div>
        );
    }

    return (
        <div ref={rootRef} className={styles['agenda']} onKeyDown={onKeyDown}>
            {
                items.map((day) => {
                    const isToday = day.date.day === today.day && day.date.month === today.month && day.date.year === today.year;
                    return (
                        <div className={styles['day-group']} key={`${day.date.year}-${day.date.month}-${day.date.day}`}>
                            <div className={classNames(styles['day-header'], { [styles['today']]: isToday })}>
                                {formatDate(day.date)}
                            </div>
                            <div className={styles['day-cards']}>
                                {
                                    collapseDay(day.items).map((card) => {
                                        const eps = card.episodes.slice().sort((a, b) => a - b);
                                        const hasSeason = typeof card.season === 'number';
                                        let sub: string | null = null;
                                        if (hasSeason && eps.length > 1) {
                                            sub = `${t('SERIES_SEASON', { defaultValue: 'Season' })} ${card.season} · ${eps.length} ${t('EPISODES', { defaultValue: 'episodes' })}`;
                                        } else if (hasSeason && eps.length === 1) {
                                            sub = `${t('SERIES_SEASON', { defaultValue: 'Season' })} ${card.season} · ${t('SERIES_EPISODE', { defaultValue: 'Episode' })} ${eps[0]}`;
                                        }
                                        return (
                                            <Button
                                                key={card.key}
                                                className={styles['episode-card']}
                                                href={card.deepLink}
                                                onClick={(event: React.MouseEvent) => onCardClick(event, card.deepLink)}
                                            >
                                                <Image className={styles['poster']} src={card.poster} alt={' '} />
                                                <div className={styles['meta']}>
                                                    <div className={styles['name']}>{card.name}</div>
                                                    {sub ? <div className={styles['sub']}>{sub}</div> : null}
                                                </div>
                                            </Button>
                                        );
                                    })
                                }
                            </div>
                        </div>
                    );
                })
            }
        </div>
    );
};

export default Agenda;
