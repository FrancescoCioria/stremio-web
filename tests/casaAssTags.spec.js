const { stripAssOverrides } = require('../vendor/stremio-video/src/withHTMLSubtitles/casaAssTags');

describe('stripAssOverrides', () => {
    test('OpenSubtitles 29/10: "{\\an8}" in testa alla cue sparisce', () => {
        expect(stripAssOverrides('{\\an8}-Yeah, I know! Skip the lecture.\n-[Emily sighs]'))
            .toBe('-Yeah, I know! Skip the lecture.\n-[Emily sighs]');
    });

    test('piu\' tag e tag in mezzo alla riga', () => {
        expect(stripAssOverrides('{\\an8}{\\i1}Ciao{\\i0} a tutti{\\pos(10,20)}')).toBe('Ciao a tutti');
    });

    test('graffe senza "\\" nel dialogo restano', () => {
        expect(stripAssOverrides('il set {a, b}')).toBe('il set {a, b}');
    });

    test('testo senza tag invariato', () => {
        expect(stripAssOverrides('<i>Ciao</i>')).toBe('<i>Ciao</i>');
    });
});
