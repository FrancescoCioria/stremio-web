// Copyright (C) 2017-2023 Smart code 203358507

if (typeof process.env.SENTRY_DSN === 'string') {
    const Sentry = require('@sentry/browser');
    Sentry.init({ dsn: process.env.SENTRY_DSN });
}

const Bowser = require('bowser');
const browser = Bowser.parse(window.navigator?.userAgent || '');
if (browser?.platform?.type === 'desktop') {
    document.querySelector('meta[name="viewport"]')?.setAttribute('content', '');
}

const React = require('react');
const ReactDOM = require('react-dom/client');
const { HashRouter } = require('react-router-dom');
const i18n = require('i18next');
const { initReactI18next } = require('react-i18next');
const stremioTranslations = require('stremio-translations');
const App = require('./App');
const { CoreProvider } = require('./core');
const { FileDropProvider, PlatformProvider } = require('./common');
const { installCasaErrorLog } = require('./common/casaErrorLog');
const { installCasaRemoteInput } = require('./common/casaRemoteInput');

// Casa: errori JS della tile -> ~/.local/state/stremio-js-errors.log. Prima di
// tutto il resto, cosi' becca anche gli errori di boot.
installCasaErrorLog();

// Casa: il tasto Menu del telecomando diventa un `contextmenu` standard, cosi'
// telecomando e tasto destro percorrono lo STESSO codice. Vedi casaRemoteInput.js.
installCasaRemoteInput();

// Casa: `html.casa-tv` = questa pagina e' la tile sulla TV, non l'app sul Mac.
//
// Lo STESSO bundle serve due schermi con distanze di lettura opposte: il
// televisore da 55" a ~2 m (dove il testo del design desktop di Stremio e'
// al limite del leggibile) e la web app sul Mac a ~60 cm (dove va gia' bene).
// Le dimensioni maggiorate stanno tutte dietro questa classe: senza, ogni
// ritocco per il divano rimpicciolisce... anzi INGRANDISCE a sproposito il
// Mac, ed e' successo davvero (2026-08-31).
//
// ⚠️ Il discriminante e' l'HOSTNAME, non la larghezza della finestra: il
// kiosk apre `localhost:8080`, il Mac `stremio.casa:8080`, un portatile via
// Tailscale `beelink-cachyos:8080`. Una media query su `min-width` sarebbe
// un indovinello (un monitor 5K da scrivania ha piu' CSS px della TV, che
// per lo zoom del kiosk sta a ~2260) e sbaglierebbe in silenzio.
// ⚠️ Impostata PRIMA del render di React: una classe aggiunta dopo il primo
// paint si vedrebbe come un salto di dimensioni a schermo.
if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    document.documentElement.classList.add('casa-tv');
}

const translations = Object.fromEntries(Object.entries(stremioTranslations()).map(([key, value]) => [key, {
    translation: value
}]));

i18n
    .use(initReactI18next)
    .init({
        resources: translations,
        lng: 'en-US',
        fallbackLng: 'en-US',
        interpolation: {
            escapeValue: false
        }
    });

const appInfo = {
    appVersion: process.env.VERSION,
    shellVersion: null
};

const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(
    <React.StrictMode>
        <PlatformProvider>
            <CoreProvider appInfo={appInfo}>
                <FileDropProvider>
                    <HashRouter>
                        <App />
                    </HashRouter>
                </FileDropProvider>
            </CoreProvider>
        </PlatformProvider>
    </React.StrictMode>
);

if (process.env.NODE_ENV === 'production' && process.env.SERVICE_WORKER_DISABLED !== 'true' && process.env.SERVICE_WORKER_DISABLED !== true && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .catch((registrationError) => {
                console.error('SW registration failed: ', registrationError);
            });
    });
}
