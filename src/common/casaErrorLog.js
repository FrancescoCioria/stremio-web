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
// Risorse che non caricano (poster, immagini, <video>): tetto SUO, cosi' una griglia
// di poster rotti non consuma il budget degli errori JS veri.
const MAX_RESOURCE_EVENTS_PER_SESSION = 15;
const MAX_MSG_LEN = 800;

let installed = false;
let sent = 0;
let sentResources = 0;
const seen = new Set();

const report = (kind, message) => {
    if (kind === 'resource-error' ? sentResources >= MAX_RESOURCE_EVENTS_PER_SESSION : sent >= MAX_EVENTS_PER_SESSION) return;

    const msg = String(message).slice(0, MAX_MSG_LEN);
    const key = kind + '|' + msg;
    if (seen.has(key)) return;
    seen.add(key);
    if (kind === 'resource-error') sentResources++;
    else sent++;

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

// L'evento 'error' in fase di CATTURA su window riceve anche il mancato caricamento
// di una risorsa (img, script, video): e' un Event semplice, senza message/filename/
// lineno. Fino al 02/10/2026 finiva nel log come "errore @ :undefined" (114 in 14
// giorni), senza dire QUALE risorsa: l'unica cosa che serve.
const describeErrorEvent = (event) => {
    const target = event && event.target;
    const isResource = target && target !== event.currentTarget && typeof target.tagName === 'string' && !event.message;
    if (isResource) {
        const url = String(target.currentSrc || target.src || target.href || '');
        return { kind: 'resource-error', message: target.tagName + ' ' + (url ? url.slice(-200) : '(senza url)') };
    }
    const where = String((event && event.filename) || '').slice(-60) + ':' + (event && event.lineno);
    return { kind: 'window-error', message: ((event && event.message) || 'errore') + ' @ ' + where };
};

const installCasaErrorLog = () => {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    window.addEventListener('error', (event) => {
        const { kind, message } = describeErrorEvent(event);
        report(kind, message);
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

module.exports = { installCasaErrorLog, report, describeErrorEvent };
