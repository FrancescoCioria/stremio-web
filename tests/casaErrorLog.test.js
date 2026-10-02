const { describeErrorEvent } = require('../src/common/casaErrorLog');

const win = { name: 'window' };

describe('describeErrorEvent', () => {
    test('risorsa che non carica: tag + url, non "errore @ :undefined"', () => {
        const img = { tagName: 'IMG', src: 'http://stremio.casa:8765/stremio-addon/poster.svg?u=x' };
        expect(describeErrorEvent({ target: img, currentTarget: win })).toEqual({
            kind: 'resource-error',
            message: 'IMG http://stremio.casa:8765/stremio-addon/poster.svg?u=x',
        });
    });

    test('video: currentSrc vince su src', () => {
        const v = { tagName: 'VIDEO', src: '', currentSrc: 'blob:http://x/1' };
        expect(describeErrorEvent({ target: v, currentTarget: win }).message).toBe('VIDEO blob:http://x/1');
    });

    test('NEGATIVO: errore JS vero resta window-error con file e riga', () => {
        expect(describeErrorEvent({ message: 'TypeError: x is undefined', filename: 'http://h/main.js', lineno: 12, target: win, currentTarget: win }))
            .toEqual({ kind: 'window-error', message: 'TypeError: x is undefined @ http://h/main.js:12' });
    });

    test('NEGATIVO: evento senza target non esplode', () => {
        expect(describeErrorEvent({}).kind).toBe('window-error');
        expect(describeErrorEvent(null).kind).toBe('window-error');
    });
});
