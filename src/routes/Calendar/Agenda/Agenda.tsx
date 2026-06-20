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
                                    day.items.map((ep) => (
                                        <Button
                                            key={ep.id}
                                            className={styles['card']}
                                            href={ep.deepLinks.metaDetailsStreams}
                                            onClick={(event: React.MouseEvent) => onCardClick(event, ep.deepLinks.metaDetailsStreams)}
                                        >
                                            <Image className={styles['poster']} src={ep.poster} alt={' '} />
                                            <div className={styles['meta']}>
                                                <div className={styles['name']}>{ep.name}</div>
                                                {
                                                    typeof ep.season === 'number' && typeof ep.episode === 'number' ?
                                                        <div className={styles['sub']}>
                                                            {t('SERIES_SEASON', { defaultValue: 'Season' })} {ep.season} · {t('SERIES_EPISODE', { defaultValue: 'Episode' })} {ep.episode}
                                                        </div>
                                                        :
                                                        null
                                                }
                                            </div>
                                        </Button>
                                    ))
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
