// Copyright (C) 2017-2024 Smart code 203358507

import React, { useMemo } from 'react';
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

const Agenda = ({ items, profile }: Props) => {
    const { t } = useTranslation();
    const { navigateWithOrigin } = useNavigateWithOrigin();
    const lang = profile?.settings?.interfaceLanguage || 'en-US';

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

    if (items === null) {
        return (
            <div className={styles['agenda']}>
                {[0, 1, 2].map((i) => (
                    <div className={styles['day-group']} key={i}>
                        <div className={classNames(styles['day-header'], styles['placeholder'])} />
                        <div className={styles['cards']}>
                            <div className={classNames(styles['card'], styles['placeholder'])} />
                            <div className={classNames(styles['card'], styles['placeholder'])} />
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
        <div className={styles['agenda']}>
            {
                items.map((day) => {
                    const isToday = day.date.day === today.day && day.date.month === today.month && day.date.year === today.year;
                    return (
                        <div className={styles['day-group']} key={`${day.date.year}-${day.date.month}-${day.date.day}`}>
                            <div className={classNames(styles['day-header'], { [styles['today']]: isToday })}>
                                {formatDate(day.date)}
                            </div>
                            <div className={styles['cards']}>
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
                                                className={styles['card']}
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
