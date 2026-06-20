// Copyright (C) 2017-2024 Smart code 203358507

import React from 'react';
// @ts-ignore – core e' JS
import { useCore } from 'stremio/core';

// Quanti mesi caricare in avanti (mese corrente incluso). Le date di messa in
// onda annunciate raramente vanno oltre ~1 anno; 12 e' un buon compromesso.
const MONTHS_AHEAD = 12;
const SETTLE_MS = 900;   // i contenuti (episodi) arrivano async dagli addon in piu' eventi
const MAX_WAIT_MS = 5000;

const ymdKey = (y: number, m: number, d: number): number => y * 10000 + m * 100 + d;

// Il model 'calendar' di stremio-core e' per-mese (singleton): per una agenda
// continua carichiamo N mesi in sequenza e li uniamo. Ogni Load sostituisce lo
// stato. La prima emissione 'state' ha la griglia giorni ma contenuto VUOTO:
// gli episodi arrivano async dagli addon in eventi successivi. Quindi NON
// risolviamo al primo evento — catturiamo lo stato piu' recente e risolviamo
// quando si "assesta" (nessun nuovo evento calendar per SETTLE_MS), con un cap.
const loadMonth = (core: any, year: number, month: number): Promise<Calendar | null> =>
    new Promise((resolve) => {
        let settled = false;
        let latest: Calendar | null = null;
        let settleTimer: ReturnType<typeof setTimeout> | null = null;
        const finish = () => {
            if (settled) return;
            settled = true;
            core.off('state', onState);
            if (settleTimer) clearTimeout(settleTimer);
            clearTimeout(maxTimer);
            resolve(latest);
        };
        const onState = async (models: string[]) => {
            if (!models.includes('calendar')) return;
            const st: Calendar = await core.transport.getState('calendar');
            if (!(st && st.selected && st.selected.year === year && st.selected.month === month)) return;
            latest = st;
            if (settleTimer) clearTimeout(settleTimer);
            settleTimer = setTimeout(finish, SETTLE_MS);
        };
        const maxTimer = setTimeout(finish, MAX_WAIT_MS);
        core.on('state', onState);
        core.transport.dispatch(
            { action: 'Load', args: { model: 'Calendar', args: { year, month, day: null } } },
            'calendar'
        );
    });

// Ritorna i giorni con contenuto dal mese corrente in avanti, ordinati per data
// crescente e senza i giorni passati. null = ancora in caricamento.
// Aggiornamento progressivo: la lista cresce man mano che i mesi arrivano.
const useCalendarAgenda = (): CalendarItem[] | null => {
    const core = useCore();
    const [items, setItems] = React.useState<CalendarItem[] | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        const base = new Date();
        const todayKey = ymdKey(base.getFullYear(), base.getMonth() + 1, base.getDate());
        const acc: CalendarItem[] = [];

        (async () => {
            for (let i = 0; i < MONTHS_AHEAD && !cancelled; i++) {
                const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
                const year = d.getFullYear();
                const month = d.getMonth() + 1;
                const st = await loadMonth(core, year, month);
                if (cancelled) return;
                for (const it of st?.items ?? []) {
                    if (!it.items.length) continue;
                    // dedup difensivo: una serie in libreria + via addon puo'
                    // comparire due volte lo stesso giorno.
                    const seen = new Set<string>();
                    const items = it.items.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
                    acc.push({ ...it, items });
                }
                const future = acc
                    .filter((it) => ymdKey(it.date.year, it.date.month, it.date.day) >= todayKey)
                    .sort((a, b) =>
                        ymdKey(a.date.year, a.date.month, a.date.day) -
                        ymdKey(b.date.year, b.date.month, b.date.day)
                    );
                setItems(future);
            }
        })();

        return () => {
            cancelled = true;
            core.transport.dispatch({ action: 'Unload' }, 'calendar');
        };
    }, [core]);

    return items;
};

export default useCalendarAgenda;
