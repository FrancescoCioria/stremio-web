// Copyright (C) 2017-2026 Smart code 203358507

// Casa: loghi dei titoli troppo SCURI per lo sfondo scuro della TV (NOCTURNE,
// BUDDY, The Devil Wears Prada 2: logo nero su fondo quasi nero, 02/11/2026).
// Si misura il logo e, se e' scuro, l'hero lo disegna bianco (`.dark-logo`).
//
// ⚠️ La misura e' il CANALE PIU' ACCESO (max r,g,b), NON la luminanza: un rosso
// pieno ha luminanza ~0,2 ma si legge benissimo (HOPE, DRACULA). Misurato sui
// 501 loghi in cache sul Beelink: sotto 0,3 = 16 loghi, tutti illeggibili (nero,
// grigio scuro, rosso scurissimo); fra 0,3 e 0,45 si mescolano loghi colorati
// buoni (Spider-Verse, Harry Potter) e qualche blu notte (Sorry Baby, HERE):
// lasciati com'erano.
//
// ⚠️ L'<img> del logo NON passa in CORS (`crossOrigin`): metahub risponde a un
// rimando 307 senza Access-Control-Allow-Origin e un logo non ancora in cache
// sarebbe diventato il titolo in testo. La misura e' una richiesta A PARTE al
// backend (`/stremio-addon/img`, CORS ok, logo gia' su disco): se fallisce il
// logo resta com'era.

const React = require('react');
const { casaBackendUrl } = require('./casaBackend');

const DARK_LOGO_MAX = 0.3;
const SAMPLE_PX = 128;

// Media del canale piu' acceso (0..1) sui pixel opachi di un RGBA. null = niente
// da misurare (tutto trasparente) o non e' un logo (quasi tutto opaco: un
// rettangolo pieno, lo sfondo fa parte dell'immagine).
const logoValue = (rgba) => {
    let sum = 0;
    let n = 0;
    const total = rgba.length / 4;
    for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3] < 128) continue;
        sum += Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) / 255;
        n++;
    }
    if (n === 0 || n > total * 0.95) return null;
    return sum / n;
};

const isDarkLogo = (value) => value !== null && value < DARK_LOGO_MAX;

// Indirizzo da cui misurare: il backend, che manda CORS e ha il logo su disco.
// Un logo gia' servito dal backend resta quello; uno esterno (Cinemeta nella
// pagina del titolo) passa dalla sua cache (`?u=`, solo host ammessi).
const measureUrl = (url) => {
    const backend = casaBackendUrl('');
    if (!backend || typeof url !== 'string') return null;
    if (url.startsWith(backend)) return url;
    if (/^https:\/\//.test(url)) return casaBackendUrl('/stremio-addon/img?u=' + encodeURIComponent(url));
    return null;
};

// url -> true/false (misurato). Una volta per logo e per sessione.
const verdicts = new Map();
const inflight = new Map();
// url -> quando la misura e' fallita (404, host non ammesso, logo non ancora
// nella cache del backend -> rimando senza CORS). Si riprova dopo un po', non a
// ogni focus.
const failedAt = new Map();
const RETRY_FAILED_MS = 10 * 60 * 1000;

const measure = (url) => {
    const target = measureUrl(url);
    if (!target) return Promise.resolve(null);
    if (verdicts.has(url)) return Promise.resolve(verdicts.get(url));
    if (Date.now() - (failedAt.get(url) || 0) < RETRY_FAILED_MS) return Promise.resolve(null);
    if (inflight.has(url)) return inflight.get(url);
    const p = fetch(target)
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => (blob ? createImageBitmap(blob) : null))
        .then((bmp) => {
            if (!bmp) return null;
            const scale = Math.min(1, SAMPLE_PX / Math.max(bmp.width, bmp.height));
            const w = Math.max(1, Math.round(bmp.width * scale));
            const h = Math.max(1, Math.round(bmp.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bmp, 0, 0, w, h);
            bmp.close();
            const dark = isDarkLogo(logoValue(ctx.getImageData(0, 0, w, h).data));
            verdicts.set(url, dark);
            return dark;
        })
        // Rete, formato, canvas: il logo resta com'e'.
        .catch(() => null)
        .then((dark) => {
            if (dark === null) failedAt.set(url, Date.now());
            return dark;
        })
        .finally(() => inflight.delete(url));
    inflight.set(url, p);
    return p;
};

// true = disegnalo chiaro. Lo stato ricorda PER QUALE logo vale: al cambio di
// titolo il verdetto del logo precedente non si applica al nuovo nemmeno per un
// frame (prima della misura vale quello gia' noto per questo url, o false).
const useDarkLogo = (url) => {
    const [state, setState] = React.useState({ url: null, dark: false });
    React.useEffect(() => {
        let cancelled = false;
        if (typeof url === 'string' && url.length > 0) {
            measure(url).then((d) => {
                if (!cancelled) setState({ url, dark: d === true });
            });
        }
        return () => {
            cancelled = true;
        };
    }, [url]);
    return state.url === url ? state.dark : verdicts.get(url) === true;
};

module.exports = { logoValue, isDarkLogo, measureUrl, useDarkLogo, DARK_LOGO_MAX };
