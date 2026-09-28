// La tile ASPETTA il backend per l'analisi del file (casaHls.fetchProbe): niente
// gara a 20 s contro server.js (2026-09-28, torrent freddo sul Mac: 20,6 s).
const { fetchProbe } = require('../vendor/stremio-video/src/casaHls');

beforeEach(() => {
    jest.useFakeTimers();
    global.window = { location: { hostname: 'stremio.casa', protocol: 'http:' } };
    global.localStorage = { getItem: () => null };
});
afterEach(() => {
    jest.useRealTimers();
    delete global.window; delete global.localStorage; delete global.fetch;
});

describe('fetchProbe', () => {
    test('backend lento (25 s) ma che risponde: vince lui, server.js mai chiamato', async () => {
        const calls = [];
        global.fetch = (u, opts) => {
            calls.push(u);
            if (u.includes('/casa-hls/probe')) {
                return new Promise((res, rej) => {
                    const t = setTimeout(() => res({ ok: true, json: () => Promise.resolve({ from: 'casa' }) }), 25000);
                    if (opts && opts.signal) opts.signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('abort')); });
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ from: 'server.js' }) });
        };
        const p = fetchProbe('http://127.0.0.1:11470/', 'http://m/f.mkv');
        jest.advanceTimersByTime(25000);
        await expect(p).resolves.toEqual({ from: 'casa' });
        expect(calls.some((u) => u.includes('/hlsv2/probe'))).toBe(false);
    });

    test('errore esplicito del backend (502): server.js come ripiego', async () => {
        global.fetch = (u) => Promise.resolve(u.includes('/casa-hls/probe')
            ? { ok: false, status: 502 }
            : { ok: true, json: () => Promise.resolve({ from: 'server.js' }) });
        await expect(fetchProbe('http://127.0.0.1:11470/', 'http://m/f.mkv')).resolves.toEqual({ from: 'server.js' });
    });
});
