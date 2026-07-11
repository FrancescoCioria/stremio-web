// Copyright (C) 2017-2023 Smart code 203358507
//
// Casa: log PERMANENTE degli errori JS della tile -> backend `/debug/js-error`
// (persistito in ~/.local/state/stremio-js-errors.log).
//
// Perche' esiste: il 2026-07-11 il player e' rimasto appeso in buffering per
// ore (carica il primo frammento HLS e non chiede piu' nulla). Per capire dove
// si fermasse abbiamo provato a iniettare uno script in `index.html` sul box:
// non e' MAI arrivato al DOM, perche' il service worker serve la sua copia
// precachata del documento. Morale: questa classe di bug NON e' osservabile da
// fuori, la strumentazione deve stare DENTRO il bundle. Quindi ci sta.
//
// Best-effort e a prova di rumore: dedup per messaggio + cap per sessione, cosi'
// un errore in un loop di render non allaga il log ne' la rete.

const { casaBeacon } = require('./casaBackend');

const ENDPOINT = '/debug/js-error';
const MAX_EVENTS_PER_SESSION = 60;
const MAX_MSG_LEN = 800;

let installed = false;
let sent = 0;
const seen = new Set();

const report = (kind, message) => {
    if (sent >= MAX_EVENTS_PER_SESSION) return;

    const msg = String(message).slice(0, MAX_MSG_LEN);
    const key = kind + '|' + msg;
    if (seen.has(key)) return;
    seen.add(key);
    sent++;

    casaBeacon(ENDPOINT, {
        ev: 'js-error',
        kind,
        msg,
        route: typeof window !== 'undefined' ? String(window.location.hash).slice(0, 160) : '',
    });
};

const describe = (value) => {
    if (value instanceof Error) return (value.stack || value.message);
    if (value && typeof value === 'object') {
        try { return JSON.stringify(value); } catch (_e) { return String(value); }
    }
    return String(value);
};

const installCasaErrorLog = () => {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    window.addEventListener('error', (event) => {
        const where = String(event.filename || '').slice(-60) + ':' + event.lineno;
        report('window-error', (event.message || 'errore') + ' @ ' + where);
    }, true);

    window.addEventListener('unhandledrejection', (event) => {
        report('rejection', describe(event.reason));
    });

    const originalError = console.error;
    console.error = function (...args) {
        report('console-error', args.map(describe).join(' '));
        originalError.apply(console, args);
    };
};

module.exports = { installCasaErrorLog, report };
