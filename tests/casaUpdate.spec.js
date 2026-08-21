// Aggiornamento della tile: riconoscere un bundle nuovo e sapere QUANDO
// ricaricare. I casi che contano sono i negativi — ricaricare durante un film,
// o ricaricare all'infinito perche' l'hash servito non cambia mai.

const {
    parseDeployedHash,
    isNewBuild,
    canApplyNow,
    nextAttempt,
    updateButtonLabel,
    updateStatusText,
} = require('../src/common/casaUpdate');

const HASH = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const INDEX = (h) => `<!doctype html><html><head><script defer src="${h}/scripts/main.js"></script></head></html>`;

describe('parseDeployedHash', () => {
    test('estrae la cartella-bundle da index.html', () => {
        expect(parseDeployedHash(INDEX(HASH))).toBe(HASH);
    });

    test('documento senza bundle -> null (non si inventa un aggiornamento)', () => {
        expect(parseDeployedHash('<html><body>errore 502</body></html>')).toBe(null);
        expect(parseDeployedHash('')).toBe(null);
        expect(parseDeployedHash(undefined)).toBe(null);
    });
});

describe('isNewBuild', () => {
    test('hash diverso = build nuova', () => {
        expect(isNewBuild(OTHER, HASH)).toBe(true);
    });

    test('stesso hash = niente da fare', () => {
        expect(isNewBuild(HASH, HASH)).toBe(false);
    });

    test('hash mancante o mozzo non vale come aggiornamento', () => {
        expect(isNewBuild(null, HASH)).toBe(false);
        expect(isNewBuild('abc', HASH)).toBe(false);
    });
});

describe('canApplyNow', () => {
    test('sul player NON si ricarica (si perderebbe il film)', () => {
        expect(canApplyNow({ routeHash: '#/player/xyz', videoPlaying: false })).toBe(false);
    });

    test('video in riproduzione fuori dal player: comunque no', () => {
        expect(canApplyNow({ routeHash: '#/', videoPlaying: true })).toBe(false);
    });

    test('fermi sulla board: si', () => {
        expect(canApplyNow({ routeHash: '#/', videoPlaying: false })).toBe(true);
        expect(canApplyNow({ routeHash: '#/settings', videoPlaying: false })).toBe(true);
    });
});

describe('nextAttempt', () => {
    test('primo tentativo per un hash mai visto', () => {
        expect(nextAttempt(null, HASH, 2)).toEqual({ allowed: true, state: { hash: HASH, n: 1 } });
    });

    test('esauriti i tentativi si smette (niente reload loop)', () => {
        expect(nextAttempt({ hash: HASH, n: 2 }, HASH, 2).allowed).toBe(false);
    });

    test('un hash NUOVO riparte da zero anche dopo un fallimento', () => {
        expect(nextAttempt({ hash: HASH, n: 2 }, OTHER, 2)).toEqual({ allowed: true, state: { hash: OTHER, n: 1 } });
    });
});

describe('etichette', () => {
    test('il pulsante dice cosa sta succedendo', () => {
        expect(updateButtonLabel('available')).toBe('Aggiorna ora');
        expect(updateButtonLabel('applying')).toBe('Aggiorno...');
        expect(updateButtonLabel('idle')).toBe('Aggiorna');
    });

    test('lo stato mostra la versione corrente quando non c e nulla da fare', () => {
        expect(updateStatusText({ status: 'current' }, 'v4.51')).toContain('v4.51');
        expect(updateStatusText({ status: 'available', deployed: OTHER }, 'v4.51')).toContain(OTHER.slice(0, 7));
        expect(updateStatusText({ status: 'error' }, 'v4.51')).toBe('Controllo non riuscito');
    });
});
