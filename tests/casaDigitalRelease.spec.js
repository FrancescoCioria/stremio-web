// Test della logica "Digitale: <data>" (casaDigitalRelease.js).
//
// Scelta utente: la data si mostra SOLO per film recenti/imminenti (dove decide
// la qualita' dei torrent). Vecchi = niente riga. Questi casi ancorano quel
// contratto: un allargamento accidentale (data su Titanic) o un restringimento
// (niente segnale su un film in sala) rompe qui.

const { digitalReleaseLabel } = require('../src/common/casaDigitalRelease');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-07-17T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

describe('digitalReleaseLabel', () => {
    test('uscita digitale futura vicina -> data + countdown', () => {
        const label = digitalReleaseLabel(iso(NOW + 3 * DAY), null, NOW);
        expect(label).toMatch(/^Disponibile dal /);
        expect(label).toMatch(/\(fra 3g\)/);
    });

    test('uscita digitale futura lontana -> data senza countdown', () => {
        const label = digitalReleaseLabel(iso(NOW + 120 * DAY), null, NOW);
        expect(label).toMatch(/^Disponibile dal /);
        expect(label).not.toMatch(/fra/);
    });

    test('uscita digitale passata recente -> mostra data', () => {
        expect(digitalReleaseLabel(iso(NOW - 30 * DAY), null, NOW)).toMatch(/^Disponibile dal /);
    });

    test('uscita digitale vecchia (>1 anno) -> niente riga', () => {
        expect(digitalReleaseLabel(iso(NOW - 400 * DAY), null, NOW)).toBeNull();
        // Titanic: uscita del 1997, digitale del 1998 -> nessuna riga oggi.
        expect(digitalReleaseLabel('1998-09-10', '1997-12-19', NOW)).toBeNull();
    });

    test('nessuna data digitale ma film recente/in sala -> "data non nota"', () => {
        expect(digitalReleaseLabel(null, iso(NOW - 20 * DAY), NOW)).toBe('Disponibile: data non nota');
        // film futuro (annunciato, non ancora uscito)
        expect(digitalReleaseLabel(null, iso(NOW + 10 * DAY), NOW)).toBe('Disponibile: data non nota');
    });

    test('nessuna data digitale + film vecchio -> niente riga', () => {
        expect(digitalReleaseLabel(null, iso(NOW - 400 * DAY), NOW)).toBeNull();
        expect(digitalReleaseLabel(null, null, NOW)).toBeNull();
    });

    test('accetta Date oltre a stringa ISO', () => {
        expect(digitalReleaseLabel(new Date(NOW - 10 * DAY), null, NOW)).toMatch(/^Disponibile dal /);
    });

    test('input malformati -> niente crash, niente riga', () => {
        expect(digitalReleaseLabel('non-una-data', 'nemmeno', NOW)).toBeNull();
    });
});
