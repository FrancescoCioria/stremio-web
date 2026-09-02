const { casaMasterUrl } = require('../vendor/stremio-video/src/casaHls');

const FALLBACK = 'http://127.0.0.1:11470/hlsv2/ID/master.m3u8?q=1';

function setup({ host = 'localhost', protocol = 'http:', flag = null, throws = false } = {}) {
    global.window = { location: { hostname: host, protocol } };
    global.localStorage = {
        getItem: () => {
            if (throws) throw new Error('storage negato');
            return flag;
        }
    };
}

afterEach(() => {
    delete global.window;
    delete global.localStorage;
});

describe('casaMasterUrl', () => {
    test('di default manda il master al backend di casa', () => {
        setup();
        expect(casaMasterUrl(FALLBACK, 'ID', 'q=1'))
            .toBe('http://localhost:8765/casa-hls/ID/master.m3u8?q=1');
    });

    test("l'host viene dalla pagina, non e' localhost fisso", () => {
        // ⚠️ Hardcodare localhost rompe l'accesso dal Mac via Tailscale: la
        // pagina arriva da un altro host e il backend di casa non e' li'.
        setup({ host: 'stremio.casa' });
        expect(casaMasterUrl(FALLBACK, 'ID', 'q=1'))
            .toBe('http://stremio.casa:8765/casa-hls/ID/master.m3u8?q=1');
    });

    test("'off' in localStorage torna a server.js", () => {
        setup({ flag: 'off' });
        expect(casaMasterUrl(FALLBACK, 'ID', 'q=1')).toBe(FALLBACK);
    });

    test('qualunque altro valore resta acceso', () => {
        setup({ flag: 'on' });
        expect(casaMasterUrl(FALLBACK, 'ID', 'q=1')).toContain('/casa-hls/');
    });

    test('se localStorage lancia, si sceglie server.js', () => {
        // In dubbio non si sperimenta: il caso peggiore dev'essere "come prima".
        setup({ throws: true });
        expect(casaMasterUrl(FALLBACK, 'ID', 'q=1')).toBe(FALLBACK);
    });

    test('senza id si resta su server.js', () => {
        setup();
        expect(casaMasterUrl(FALLBACK, null, 'q=1')).toBe(FALLBACK);
    });
});
