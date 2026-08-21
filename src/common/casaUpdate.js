// Copyright (C) 2017-2026 Smart code 203358507
//
// Aggiornamento della tile senza passare dal browser.
//
// Il problema: dall'app installata (web app sul Mac, kiosk sulla TV) NON c'e'
// modo di forzare un refresh — niente barra, niente scorciatoia. Se la pagina
// aperta e' un bundle vecchio ci resta finche' qualcuno non chiude e riapre, e
// nemmeno quello basta sempre (cache HTTP di Firefox / Safari).
//
// Come si riconosce una versione nuova: `index.html` referenzia gli script in
// una cartella nominata con l'hash del commit (webpack.config.js). Basta
// rileggere `/` saltando ogni cache e confrontare quell'hash con il proprio
// (`process.env.COMMIT_HASH`, iniettato nel bundle che sta girando). Nessun
// endpoint da mantenere, nessuno stato server: la verita' e' il documento che
// il web server sta servendo in questo momento.
//
// ⚠️ Applicare = RICARICARE. Mai mentre si guarda un film: si perderebbe la
// riproduzione per un aggiornamento che puo' aspettare. Se l'aggiornamento
// arriva mentre il player e' aperto resta in attesa e scatta all'uscita.
//
// ⚠️ Tetto ai tentativi: se dopo il reload l'hash servito e' ANCORA quello
// vecchio (proxy o cache che non molla) senza tetto si ricaricherebbe in loop,
// all'infinito, davanti all'utente. Dopo MAX_ATTEMPTS si smette e resta il
// pulsante manuale in Settings.

const { casaBeacon } = require('./casaBackend');

// L'hash della cartella-bundle dentro index.html. 40 hex = commit git intero.
const HASH_RE = /([0-9a-f]{40})\/scripts\/main\.js/;

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 8000;
const VISIBILITY_THROTTLE_MS = 60 * 1000;
const MAX_ATTEMPTS = 2;
const ATTEMPTS_KEY = 'casa:update-attempts';

const parseDeployedHash = (html) => {
    const m = HASH_RE.exec(String(html || ''));
    return m ? m[1] : null;
};

const currentHash = () => String(process.env.COMMIT_HASH || '');

const isNewBuild = (deployed, current) =>
    typeof deployed === 'string' && deployed.length === 40 && deployed !== current;

// Ricaricare e' sicuro solo fuori dal player e senza un video in riproduzione.
// Il secondo controllo non e' ridondante: la rotta e' l'intenzione dell'utente,
// il video e' il fatto (un trailer o un player che non ha ancora cambiato hash
// starebbe suonando lo stesso).
const canApplyNow = ({ routeHash, videoPlaying }) =>
    !String(routeHash || '').startsWith('#/player') && !videoPlaying;

// Tentativi per hash, non globali: un aggiornamento nuovo riparte da zero anche
// se il precedente aveva esaurito i suoi.
const nextAttempt = (previous, hash, max = MAX_ATTEMPTS) => {
    const n = previous && previous.hash === hash ? previous.n : 0;
    return n >= max
        ? { allowed: false, state: previous }
        : { allowed: true, state: { hash, n: n + 1 } };
};

// Etichette del pulsante in Settings. Qui e non nel componente: sono la parte
// che dice all'utente cosa sta succedendo, e vanno ancorate da un test.
const updateButtonLabel = (status) => {
    switch (status) {
        case 'applying': return 'Aggiorno...';
        case 'checking': return 'Controllo...';
        case 'available': return 'Aggiorna ora';
        default: return 'Aggiorna';
    }
};

const updateStatusText = (state, current) => {
    const version = current || '';
    switch (state && state.status) {
        case 'available': return 'Nuova versione disponibile (' + String(state.deployed || '').slice(0, 7) + ')';
        case 'current': return 'Aggiornata (' + version + ')';
        case 'error': return 'Controllo non riuscito';
        default: return version;
    }
};

module.exports = {
    HASH_RE,
    CHECK_INTERVAL_MS,
    FIRST_CHECK_DELAY_MS,
    VISIBILITY_THROTTLE_MS,
    MAX_ATTEMPTS,
    ATTEMPTS_KEY,
    parseDeployedHash,
    currentHash,
    isNewBuild,
    canApplyNow,
    nextAttempt,
    updateButtonLabel,
    updateStatusText,
};

// --- Store (singleton) ----------------------------------------------------
// Un solo controllo in volo per tutta l'app: lo leggono sia l'updater
// automatico sia il pulsante in Settings, e devono vedere lo stesso stato.
// status: idle | checking | current | available | applying | error

let state = { status: 'idle', deployed: null, checkedAt: null };
const listeners = new Set();
let lastCheckAt = 0;
let reportedAlive = false;

const getState = () => state;

const setState = (patch) => {
    state = Object.assign({}, state, patch);
    listeners.forEach((l) => {
        try { l(); } catch (_e) { /* un listener rotto non blocca gli altri */ }
    });
};

const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const report = (payload) => casaBeacon('/debug/player-event', Object.assign({ ev: 'casa-update' }, payload));

const readAttempts = () => {
    try { return JSON.parse(window.sessionStorage.getItem(ATTEMPTS_KEY)) || null; } catch (_e) { return null; }
};

const writeAttempts = (value) => {
    try { window.sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(value)); } catch (_e) { /* best-effort */ }
};

const videoPlaying = () => {
    const v = document.querySelector('video');
    return !!v && !v.paused && !v.ended && v.currentTime > 0;
};

// Rilegge il documento saltando ogni cache: query unica (nessun browser puo'
// avere in cache un URL che non ha mai visto) + `no-store` per la cache HTTP.
// Non passa dal service worker: la regola runtime copre solo le navigazioni, e
// index.html e' escluso dalla precache.
const check = async () => {
    if (state.status === 'checking' || state.status === 'applying') return state;
    setState({ status: 'checking' });
    lastCheckAt = Date.now();
    try {
        const url = new URL(window.location.pathname, window.location.origin);
        url.searchParams.set('casa-update-check', String(Date.now()));
        const res = await fetch(url.toString(), { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const deployed = parseDeployedHash(await res.text());
        if (deployed === null) throw new Error('hash non trovato in index.html');
        const isNew = isNewBuild(deployed, currentHash());
        setState({ status: isNew ? 'available' : 'current', deployed, checkedAt: Date.now() });
        if (isNew) {
            report({ step: 'available', deployed, current: currentHash() });
        } else if (!reportedAlive) {
            // Controllo POSITIVO, una volta per caricamento: senza, un
            // controllore morto produce lo stesso log di un controllore che non
            // trova niente da fare — cioe' nessuna riga. Il silenzio va potuto
            // distinguere dall'assenza.
            reportedAlive = true;
            report({ step: 'check-ok', current: currentHash() });
        }
    } catch (e) {
        setState({ status: 'error', checkedAt: Date.now() });
        report({ step: 'check-failed', error: String((e && e.message) || e) });
    }
    return state;
};

// Svuota tutto cio' che potrebbe riservire il bundle vecchio e ricarica.
// L'unregister del service worker e' volutamente brutale: si ri-registra al
// caricamento successivo, e senza di lui la pagina funziona comunque.
const apply = async (reason) => {
    setState({ status: 'applying' });
    report({ step: 'apply', reason, deployed: state.deployed });
    try {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((k) => window.caches.delete(k)));
    } catch (_e) { /* best-effort */ }
    try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
    } catch (_e) { /* best-effort */ }
    window.location.reload();
};

// Applica l'aggiornamento gia' trovato, se e' il momento e se restano tentativi.
const applyPendingIfSafe = async () => {
    if (state.status !== 'available') return false;
    if (!canApplyNow({ routeHash: window.location.hash, videoPlaying: videoPlaying() })) {
        report({ step: 'deferred', where: 'player' });
        return false;
    }
    const attempt = nextAttempt(readAttempts(), state.deployed);
    if (!attempt.allowed) {
        report({ step: 'give-up', deployed: state.deployed, attempts: MAX_ATTEMPTS });
        return false;
    }
    writeAttempts(attempt.state);
    await apply('auto');
    return true;
};

// Un giro completo: controlla e, se c'e' qualcosa, applica quando si puo'.
const autoTick = async (throttleMs) => {
    if (throttleMs && Date.now() - lastCheckAt < throttleMs) return;
    if (state.status !== 'available') await check();
    await applyPendingIfSafe();
};

// Pulsante "Aggiorna": ricarica SEMPRE, anche se la versione e' gia' l'ultima.
// E' anche l'unico modo di sbloccare una UI incastrata dall'app installata,
// dove il refresh del browser non esiste.
const forceReload = async () => { await apply('manual'); };

module.exports.getState = getState;
module.exports.subscribe = subscribe;
module.exports.check = check;
module.exports.applyPendingIfSafe = applyPendingIfSafe;
module.exports.autoTick = autoTick;
module.exports.forceReload = forceReload;
