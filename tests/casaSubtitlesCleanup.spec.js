const { stripAssOverrides, fixMojibake, cleanCueText } = require('../vendor/stremio-video/src/withHTMLSubtitles/casaSubtitlesCleanup');

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

describe('fixMojibake', () => {
    test('29/10: "justâ€¦" (UTF-8 letto come cp1252) torna "just…"', () => {
        expect(fixMojibake('but it justâ€¦ He just stinks now.')).toBe('but it just… He just stinks now.');
    });

    test('accentate e simboli dal campione', () => {
        expect(fixMojibake('cafÃ©, Ã\u00a0la, Ã¡, Â£5')).toBe('café, àla, á, £5');
        expect(fixMojibake('Ãˆ vero, perchÃ¨')).toBe('È vero, perchè');
        expect(fixMojibake('â€œciaoâ€\u009d, Iâ€™m')).toBe('“ciao”, I’m');
    });

    test('testo giusto invariato', () => {
        for (const s of ['ADAPTAÇÃO | REVISÃO', 'È… è difficile', 'perché… no', 'Ã', '© «sì»', 'NÃO…']) {
            expect(fixMojibake(s)).toBe(s);
        }
    });
});

describe('cleanCueText', () => {
    test('tag ASS e mojibake insieme', () => {
        expect(cleanCueText('{\\an8}Umâ€¦')).toBe('Um…');
    });
});
