// Copyright (C) 2017-2024 Smart code 203358507

import React from 'react';
import { useProfile, withCoreSuspender } from 'stremio/common';
import { MainNavBars } from 'stremio/components';
import Agenda from './Agenda';
import Placeholder from './Placeholder';
import useCalendarAgenda from './useCalendarAgenda';
import styles from './Calendar.less';
import classNames from 'classnames';

// Casa TV: il Calendar e' una agenda continua (no grid mensile, no navigazione
// per mese). Mostra, raggruppati per data e in ordine cronologico, gli episodi
// in arrivo delle serie seguite — dal mese corrente in avanti. Vedi
// useCalendarAgenda (carica N mesi e li unisce) + Agenda (render a card).
const Calendar = () => {
    const profile = useProfile();
    const items = useCalendarAgenda();

    return (
        <MainNavBars className={styles['calendar']} route={'calendar'}>
            {
                profile.auth !== null ?
                    <div className={classNames(styles['content'], 'animation-fade-in')}>
                        <Agenda items={items} profile={profile} />
                    </div>
                    :
                    <Placeholder />
            }
        </MainNavBars>
    );
};

const CalendarFallback = () => (
    <MainNavBars className={styles['calendar']} />
);

export default withCoreSuspender(Calendar, CalendarFallback);
