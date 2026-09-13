// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: ACCELERAZIONE dei seek concatenati (freccia tenuta / tasto avanti).
//
// Il caso reale (2026-09-13, Silo S03E06): per arrivare a 30 minuti nel film
// l'utente ha tenuto la freccia destra sulla barra per ~30 secondi. Ogni
// pressione vale `seekTimeDuration` (10s) e il telecomando ne emette una ogni
// 180ms (remote2kb, NAV_REPEAT_INTERVAL_S) → ~55 secondi di film al secondo,
// sempre gli stessi, dal primo tocco al trentesimo. Un telecomando TV invece
// ACCELERA: i primi tocchi sono precisi, tenendo premuto il passo cresce.
//
// Come decide "concatenato": la pressione precedente nella STESSA direzione e'
// arrivata meno di CHAIN_MS fa. ⚠️ Non esiste un segnale del browser per
// questo: remote2kb bypassa l'autorepeat del kernel e ri-emette DOWN+UP
// sintetici a ogni ripetizione, quindi `event.repeat` e' sempre false e il
// keyup arriva a ogni tocco. La finestra e' l'unica informazione disponibile,
// e va tenuta sopra i due ritmi del telecomando (180ms frecce, 350ms tasto
// avanti/indietro con il cap di 2s che obbliga a ri-premere) e sotto un
// secondo tocco deliberato dopo aver GUARDATO dove si e' arrivati.
//
// La BASE del seek concatenato e' il bersaglio precedente, non il tempo del
// player: dopo `setTime` il `<video>` riporta la nuova posizione al `seeking`,
// ma la conferma passa da un render React e una pressione puo' arrivare prima
// → il tempo letto sarebbe quello vecchio e due pressioni varrebbero una.
//
// Scala: i primi tocchi restano al passo scelto dall'utente nelle
// impostazioni (precisione), poi 2x, 4x, 8x. Con 10s: 30 minuti in ~6s di
// pressione invece di ~33.

const CHAIN_MS = 700;
// Moltiplicatore per numero di pressione nella catena (1-based).
const LADDER = [
    [4, 1], // pressioni 1-3: passo base
    [9, 2], // 4-8
    [16, 4], // 9-15
];
const MAX_MULTIPLIER = 8;

const initialSeekChain = () => ({ direction: 0, count: 0, target: null, at: null });

const multiplierFor = (count) => {
    for (const [until, mult] of LADDER) {
        if (count < until) return mult;
    }
    return MAX_MULTIPLIER;
};

// direction: +1 avanti, -1 indietro. step: passo base in ms (dalle impostazioni).
// time/duration: stato del player (ms). now: timestamp (ms).
// Ritorna { target, chain }: `target` gia' clampato in [0, duration].
const nextSeek = ({ direction, step, time, duration, now, chain }) => {
    const prev = chain || initialSeekChain();
    const chained = prev.count > 0 &&
        prev.direction === direction &&
        prev.target !== null &&
        typeof prev.at === 'number' &&
        now - prev.at <= CHAIN_MS;
    const count = chained ? prev.count + 1 : 1;
    const base = chained ? prev.target : time;
    const raw = base + direction * step * multiplierFor(count);
    const max = typeof duration === 'number' && !isNaN(duration) ? duration : Infinity;
    const target = Math.max(0, Math.min(max, raw));
    return { target, chain: { direction, count, target, at: now } };
};

module.exports = { nextSeek, initialSeekChain, multiplierFor, CHAIN_MS, MAX_MULTIPLIER };
