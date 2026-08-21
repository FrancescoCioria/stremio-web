// Auto-setup Casa: quale streaming server URL scrivere, e quando NON scriverlo.
//
// Il caso che conta e' il negativo: sulla TV il valore gia' salvato e' il
// default `http://127.0.0.1:11470/`, e se questa logica lo giudicasse "diverso"
// riscriverebbe le settings ad ogni avvio. Il caso positivo e' il Mac remoto,
// dove quello stesso default punta il player a un loopback in cui non c'e'
// nessuno.

const { streamingServerUrlForHost, sameServerUrl, serverUrlUpdate } = require('../src/common/casaAutoSetup');

describe('streamingServerUrlForHost', () => {
    test("loopback -> 127.0.0.1, mai `localhost` (puo' risolvere a ::1)", () => {
        expect(streamingServerUrlForHost('localhost')).toBe('http://127.0.0.1:11470/');
        expect(streamingServerUrlForHost('127.0.0.1')).toBe('http://127.0.0.1:11470/');
        expect(streamingServerUrlForHost('::1')).toBe('http://127.0.0.1:11470/');
    });

    test('host remoto -> stesso host della pagina, porta 11470', () => {
        expect(streamingServerUrlForHost('stremio.casa')).toBe('http://stremio.casa:11470/');
        expect(streamingServerUrlForHost('beelink-cachyos')).toBe('http://beelink-cachyos:11470/');
        expect(streamingServerUrlForHost('100.114.200.47')).toBe('http://100.114.200.47:11470/');
    });
});

describe('sameServerUrl', () => {
    test('lo slash finale non fa differenza', () => {
        expect(sameServerUrl('http://127.0.0.1:11470', 'http://127.0.0.1:11470/')).toBe(true);
    });

    test('host diverso = server diverso', () => {
        expect(sameServerUrl('http://127.0.0.1:11470/', 'http://stremio.casa:11470/')).toBe(false);
    });

    test('assente non e mai uguale a qualcosa', () => {
        expect(sameServerUrl(undefined, 'http://127.0.0.1:11470/')).toBe(false);
        expect(sameServerUrl(null, 'http://127.0.0.1:11470/')).toBe(false);
    });
});

describe('serverUrlUpdate', () => {
    test('sulla TV col default gia salvato -> nessuna scrittura', () => {
        const settings = { streamingServerUrl: 'http://127.0.0.1:11470/' };
        expect(serverUrlUpdate(settings, 'localhost')).toBe(null);
    });

    test('dal Mac remoto col default loopback -> lo corregge', () => {
        const settings = { streamingServerUrl: 'http://127.0.0.1:11470/' };
        expect(serverUrlUpdate(settings, 'stremio.casa')).toBe('http://stremio.casa:11470/');
    });

    test('settings senza URL (profilo appena resettato) -> lo scrive', () => {
        expect(serverUrlUpdate({}, 'localhost')).toBe('http://127.0.0.1:11470/');
        expect(serverUrlUpdate(undefined, 'localhost')).toBe('http://127.0.0.1:11470/');
    });
});

// --- Preferenze di casa che il login azzera --------------------------------
// Il caso che conta e' il terzo: dopo un reset il valore corrente E' il default
// di Stremio, e se lo si prendesse per buono la scelta dell'utente sparirebbe
// proprio quando va ripristinata.
const { CASA_SETTING_DEFAULTS, desiredSettings, settingsPatch } = require('../src/common/casaAutoSetup');

describe('preferenze di casa', () => {
    test('senza nulla salvato vale il default di casa (blur acceso)', () => {
        expect(desiredSettings(null)).toEqual({ hideSpoilers: true });
        expect(CASA_SETTING_DEFAULTS.hideSpoilers).toBe(true);
    });

    test('la scelta esplicita dell utente vince sul default di casa', () => {
        expect(desiredSettings({ hideSpoilers: false })).toEqual({ hideSpoilers: false });
    });

    test('settings appena azzerate dal login -> patch che rimette il blur', () => {
        expect(settingsPatch({ hideSpoilers: false }, { hideSpoilers: true })).toEqual({ hideSpoilers: true });
    });

    test('gia a posto -> nessuna scrittura', () => {
        expect(settingsPatch({ hideSpoilers: true }, { hideSpoilers: true })).toBe(null);
    });

    test('chi ha scelto di spegnerlo non se lo vede riaccendere', () => {
        expect(settingsPatch({ hideSpoilers: false }, desiredSettings({ hideSpoilers: false }))).toBe(null);
    });
});
