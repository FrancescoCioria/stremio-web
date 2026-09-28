// La tile ASPETTA il backend per l'analisi del file (casaHls.fetchProbe): nessun
// limite di tempo (2026-09-28: 20 s troncavano un torrent freddo a 20,6 s); si
// annulla uscendo dal player, e allora niente ripiego su server.js.
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

    test('backend che risponde dopo 5 minuti: si aspetta ancora (nessun limite)', async () => {
        global.fetch = (u) => (u.includes('/casa-hls/probe')
            ? new Promise((res) => setTimeout(() => res({ ok: true, json: () => Promise.resolve({ from: 'casa' }) }), 300000))
            : Promise.resolve({ ok: true, json: () => Promise.resolve({ from: 'server.js' }) }));
        const p = fetchProbe('http://127.0.0.1:11470/', 'http://m/f.mkv');
        jest.advanceTimersByTime(300000);
        await expect(p).resolves.toEqual({ from: 'casa' });
    });

    test('uscita dal player: la richiesta si annulla e NON si chiede a server.js', async () => {
        const calls = [];
        global.fetch = (u, opts) => {
            calls.push(u);
            return new Promise((res, rej) => opts.signal.addEventListener('abort', () => rej(new Error('abort'))));
        };
        const ctrl = new AbortController();
        const p = fetchProbe('http://127.0.0.1:11470/', 'http://m/f.mkv', ctrl.signal);
        ctrl.abort();
        await expect(p).rejects.toThrow('abort');
        expect(calls.some((u) => u.includes('/hlsv2/probe'))).toBe(false);
    });

    test('errore esplicito del backend (502): server.js come ripiego', async () => {
        global.fetch = (u) => Promise.resolve(u.includes('/casa-hls/probe')
            ? { ok: false, status: 502 }
            : { ok: true, json: () => Promise.resolve({ from: 'server.js' }) });
        await expect(fetchProbe('http://127.0.0.1:11470/', 'http://m/f.mkv')).resolves.toEqual({ from: 'server.js' });
    });
});
