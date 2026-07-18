// Test della logica "embedded rotto -> esterno Casa" (casaEmbeddedSubs.js).
//
// Ogni blocco ancora un pezzo dell'incidente del 2026-07-18 ("due spicci" E02/E03):
// se qualcuno rimette il match-per-id-esatto, o toglie il fail-open, o allenta la
// guardia anti-stale, si rompe qui e non sulla TV a meta' episodio.

const {
    casaIdForEmbedded,
    isCasaEmbeddedId,
    resolveSavedExtraTrack,
    streamUrlMatchesVideo,
} = require('../src/common/casaEmbeddedSubs');

const casa = (i, lang = 'ita') => ({ id: `CASA_EMB_${i}`, lang, label: `Sub ${i}` });

describe('casaIdForEmbedded', () => {
    test('mappa per INDICE, non per lingua (Italian vs Italian SDH sono entrambe ita)', () => {
        expect(casaIdForEmbedded('EMBEDDED_0')).toBe('CASA_EMB_0');
        expect(casaIdForEmbedded('EMBEDDED_1')).toBe('CASA_EMB_1');
        expect(casaIdForEmbedded('EMBEDDED_12')).toBe('CASA_EMB_12');
    });

    test('null su cio che non e un id embedded', () => {
        expect(casaIdForEmbedded('CASA_EMB_0')).toBeNull();
        expect(casaIdForEmbedded('EMBEDDED_')).toBeNull();
        expect(casaIdForEmbedded(null)).toBeNull();
        expect(casaIdForEmbedded(undefined)).toBeNull();
    });

    test('isCasaEmbeddedId distingue le nostre tracce', () => {
        expect(isCasaEmbeddedId('CASA_EMB_3')).toBe(true);
        expect(isCasaEmbeddedId('EMBEDDED_3')).toBe(false);
        expect(isCasaEmbeddedId(null)).toBe(false);
    });
});

// Normalizzatore lingua finto, come `languages.toCode`: 'ita'/'it'/'Italian'
// collassano sullo stesso codice.
const toCode = (l) => ({ ita: 'it', it: 'it', italian: 'it', eng: 'en', en: 'en', english: 'en' })[String(l).toLowerCase()] ?? String(l);

describe('resolveSavedExtraTrack', () => {
    // IL BUG DI STASERA. La preferenza salvata era EMBEDDED_0; l'auto-select
    // cercava 'EMBEDDED_0' fra gli esterni per match esatto, non lo trovava,
    // ricadeva sull'embedded rotto e chiudeva il latch -> 4 secondi dopo il
    // nostro switch veniva annullato per sempre.
    test('un EMBEDDED salvato risolve alla controparte Casa (era il clobber)', () => {
        const track = resolveSavedExtraTrack('EMBEDDED_0', [casa(0), casa(1)]);
        expect(track && track.id).toBe('CASA_EMB_0');
    });

    test('sceglie lo STESSO indice, non la prima traccia della stessa lingua', () => {
        // EMBEDDED_1 = "Italian (SDH)". Risolvere su CASA_EMB_0 ("Italian")
        // darebbe all'utente un sottotitolo diverso da quello che aveva scelto.
        const track = resolveSavedExtraTrack('EMBEDDED_1', [casa(0), casa(1)]);
        expect(track && track.id).toBe('CASA_EMB_1');
    });

    test('il match esatto su un esterno vero resta prioritario', () => {
        const os = { id: 'os-12345', lang: 'ita' };
        expect(resolveSavedExtraTrack('os-12345', [os, casa(0)])).toBe(os);
    });

    test('nessuna controparte Casa -> undefined (si ricade sullembedded)', () => {
        expect(resolveSavedExtraTrack('EMBEDDED_5', [casa(0), casa(1)])).toBeUndefined();
        expect(resolveSavedExtraTrack(null, [casa(0)])).toBeUndefined();
        expect(resolveSavedExtraTrack('EMBEDDED_0', [])).toBeUndefined();
        expect(resolveSavedExtraTrack('EMBEDDED_0', null)).toBeUndefined();
    });

    // I due <n> vengono da namespace diversi (stream sub del container vs
    // rendition agganciate da hls): un sub BITMAP saltato dal manifest li fa
    // slittare. Senza questo controllo consegneremmo la lingua sbagliata muti.
    test('lingua discordante -> rifiuta lalias (indici slittati)', () => {
        const tracks = [casa(0, 'eng'), casa(1, 'ita')];
        expect(resolveSavedExtraTrack('EMBEDDED_0', tracks, 'ita', toCode)).toBeUndefined();
    });

    test('lingua concorde in forme diverse -> accetta', () => {
        const tracks = [casa(0, 'italian')];
        const track = resolveSavedExtraTrack('EMBEDDED_0', tracks, 'ita', toCode);
        expect(track && track.id).toBe('CASA_EMB_0');
    });

    test('lingua non nota da un lato -> si fida dellindice (fail-open)', () => {
        expect(resolveSavedExtraTrack('EMBEDDED_0', [casa(0, 'ita')], null, toCode).id).toBe('CASA_EMB_0');
        expect(resolveSavedExtraTrack('EMBEDDED_0', [casa(0, null)], 'ita', toCode).id).toBe('CASA_EMB_0');
    });

    test('senza normalizzatore confronta le stringhe grezze', () => {
        expect(resolveSavedExtraTrack('EMBEDDED_0', [casa(0, 'ita')], 'ita')).toBeTruthy();
        expect(resolveSavedExtraTrack('EMBEDDED_0', [casa(0, 'eng')], 'ita')).toBeUndefined();
    });
});

describe('streamUrlMatchesVideo', () => {
    const url = (se) => `http://x:8765/stremio-addon/ts/abc123/3?se=${se}`;

    // La finestra stale misurata alle 21:24:45: stream.url era ancora E02
    // mentre selected era gia' E03 -> estraevamo i sub dell'episodio sbagliato.
    test('url dellepisodio PRECEDENTE -> mismatch (si aspetta)', () => {
        expect(streamUrlMatchesVideo(url('1.2'), 'tt38821531:1:3')).toBe(false);
    });

    test('url coerente -> ok', () => {
        expect(streamUrlMatchesVideo(url('1.3'), 'tt38821531:1:3')).toBe(true);
    });

    test('stagione diversa, stesso numero episodio -> mismatch', () => {
        expect(streamUrlMatchesVideo(url('2.3'), 'tt38821531:1:3')).toBe(false);
    });

    // Fail-open: senza dati da confrontare non si blocca mai la riproduzione.
    test('film (niente se=) -> non blocca', () => {
        expect(streamUrlMatchesVideo('http://x:8765/stremio-addon/ts/abc123/0', 'tt1234567')).toBe(true);
    });

    test('videoId non ancora noto -> non blocca', () => {
        expect(streamUrlMatchesVideo(url('1.3'), null)).toBe(true);
    });

    test('url nulla -> non blocca (ci pensa il chiamante)', () => {
        expect(streamUrlMatchesVideo(null, 'tt38821531:1:3')).toBe(true);
    });
});
