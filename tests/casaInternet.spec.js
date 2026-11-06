// Banner "Niente internet": i casi che contano sono quelli in cui NON deve
// accendersi (backend muto durante un deploy, risposta storta) e quelli in cui
// non deve spegnersi a meta' (un giro saltato durante il blackout).

const { parseHealth, minutesOffline, nextBannerState } = require('../src/common/casaInternet');

describe('parseHealth', () => {
    test('online', () => {
        expect(parseHealth({ online: true, since: null, reason: null })).toEqual({ online: true, since: null });
    });

    test('offline con since', () => {
        const h = parseHealth({ online: false, since: '2026-11-05T18:49:03.860Z', reason: 'down' });
        expect(h.online).toBe(false);
        expect(h.since).toBe(Date.parse('2026-11-05T18:49:03.860Z'));
    });

    test('risposta storta -> null (stato sconosciuto, non offline)', () => {
        expect(parseHealth(null)).toBe(null);
        expect(parseHealth({})).toBe(null);
        expect(parseHealth({ online: 'no' })).toBe(null);
        expect(parseHealth('<html>502</html>')).toBe(null);
    });

    test('backend appena riavviato (settled:false) -> sconosciuto, anche se dice online', () => {
        expect(parseHealth({ online: true, since: null, reason: null, settled: false })).toBe(null);
        expect(parseHealth({ online: true, since: null, reason: null, settled: true })).toEqual({ online: true, since: null });
    });

    test('since illeggibile -> null, ma offline resta offline', () => {
        expect(parseHealth({ online: false, since: 'boh' })).toEqual({ online: false, since: null });
    });
});

describe('minutesOffline', () => {
    const since = Date.parse('2026-11-05T18:49:00Z');
    test('minuti interi', () => {
        expect(minutesOffline(since, since + 59 * 1000)).toBe(0);
        expect(minutesOffline(since, since + 3 * 60000 + 10)).toBe(3);
    });
    test('orologio della pagina indietro -> 0, mai negativo', () => {
        expect(minutesOffline(since, since - 5000)).toBe(0);
    });
    test('senza since -> null', () => {
        expect(minutesOffline(null, Date.now())).toBe(null);
    });
});

describe('nextBannerState', () => {
    const ON = { online: true, since: null };
    const OFF = { online: false, since: 1 };

    test('casa sana: niente banner', () => {
        expect(nextBannerState('hidden', ON)).toBe('hidden');
    });

    test('backend muto (deploy) a casa sana: NON si accende', () => {
        expect(nextBannerState('hidden', null)).toBe('hidden');
    });

    test('linea giu\' -> offline', () => {
        expect(nextBannerState('hidden', OFF)).toBe('offline');
    });

    test('giro saltato durante il blackout: resta offline', () => {
        expect(nextBannerState('offline', null)).toBe('offline');
    });

    test('linea tornata -> back, e back resta finche\' lo spegne il timer', () => {
        expect(nextBannerState('offline', ON)).toBe('back');
        expect(nextBannerState('back', ON)).toBe('back');
    });

    test('backend morto durante il blackout: dopo 3 letture illeggibili si spegne', () => {
        expect(nextBannerState('offline', null, 2)).toBe('offline');
        expect(nextBannerState('offline', null, 3)).toBe('hidden');
    });

    test('ricade durante il "tornato" -> di nuovo offline', () => {
        expect(nextBannerState('back', OFF)).toBe('offline');
    });
});
