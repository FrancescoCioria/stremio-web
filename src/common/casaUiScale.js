// Copyright (C) 2017-2026 Smart code 203358507
//
// Zoom UI Casa: scala il font-size del root di un fattore persistito
// per-profilo in localStorage. Applicato in App/styles.less come
// `calc(<breakpoint>px * var(--casa-ui-scale, 1))`.
//
// NON un `zoom` CSS (come nel launcher, home-server/launcher/frontend): qui
// `html` stesso e' dimensionato in vw/vh (App/styles.less, @html-width/
// @html-height) e un `zoom` sul root raddoppierebbe la scala anche li',
// facendo uscire il documento dallo schermo — esattamente il bug trovato e
// corretto sul launcher. Il font-size invece lascia intatte le vw/vh (restano
// ancorate al viewport fisico) e scala solo il rem, che e' il 95% delle
// dimensioni di questa app (misurato: 1244 usi di rem contro 44 px e 9 vw/vh
// in tutto `src`) — lo STESSO meccanismo con cui i breakpoint di
// App/styles.less gia' passano da 14 a 18px fra mobile e TV.
//
// ⚠️ Per-ORIGINE, non sincronizzato col launcher: la TV (localhost:8080) e il
// Mac da remoto (beelink-cachyos:8080) sono due origin diverse quindi due
// localStorage separati. E' voluto — la TV a 3m vuole +10%, il Mac da vicino
// no, non hanno lo stesso zoom giusto.

const STORAGE_KEY = 'casa:ui-scale';
const CSS_VAR = '--casa-ui-scale';

const DEFAULT_SCALE = 1.1;
const MIN_SCALE = 0.9;
const MAX_SCALE = 1.3;
const STEP = 0.05;

const clamp = (value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

// nuovo valore per una freccia, o null se il tasto non ci riguarda: cosi'
// ArrowUp/Down passano oltre e la spatial-nav cambia riga (stesso pattern di
// Settings/Streaming/cacheSize.js::nextGbForKey).
const nextScaleForKey = (key, scale) => {
    if (key === 'ArrowRight') return clamp(Math.round((scale + STEP) * 100) / 100);
    if (key === 'ArrowLeft') return clamp(Math.round((scale - STEP) * 100) / 100);
    return null;
};

const scaleLabel = (scale) => `${Math.round(scale * 100)}%`;

const parseStored = (raw) => {
    const n = raw === null || raw === undefined ? NaN : Number.parseFloat(raw);
    return Number.isFinite(n) ? clamp(n) : DEFAULT_SCALE;
};

let current = DEFAULT_SCALE;
const listeners = new Set();

const applyToDom = (scale) => {
    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.style.setProperty(CSS_VAR, String(scale));
    }
};

// Da chiamare una volta, il prima possibile (useLayoutEffect, non useEffect:
// deve applicarsi PRIMA che il browser dipinga, altrimenti si vede un flash
// dal default 1.1 gia' nel CSS al valore persistito dell'utente).
const init = () => {
    try {
        current = parseStored(window.localStorage.getItem(STORAGE_KEY));
    } catch (_e) {
        // storage assente/illeggibile (privata, quota, contesto senza
        // storage): resta il default gia' nel CSS.
        current = DEFAULT_SCALE;
    }
    applyToDom(current);
};

const getState = () => current;

const setScale = (value) => {
    const next = clamp(value);
    current = next;
    applyToDom(next);
    try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch (_e) {
        // quota piena/negata: resta applicato in RAM per questa sessione.
    }
    listeners.forEach((cb) => cb(next));
};

const subscribe = (cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
};

module.exports = {
    DEFAULT_SCALE,
    MIN_SCALE,
    MAX_SCALE,
    STEP,
    clamp,
    nextScaleForKey,
    scaleLabel,
    parseStored,
    init,
    getState,
    setScale,
    subscribe,
};
