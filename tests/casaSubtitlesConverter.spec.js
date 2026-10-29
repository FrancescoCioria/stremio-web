const { convert } = require('../vendor/stremio-video/src/withHTMLSubtitles/subtitlesConverter');

describe('srt2webvtt', () => {
    test('Paperman 29/10: riga vuota dentro una battuta -> testo riattaccato, file salvo', () => {
        const srt = '16\n00:07:35,781 --> 00:07:38,446\nreasonably to a destination\n\nHave you\n\n17\n00:07:38,447 --> 00:07:41,401\never found';
        expect(convert(srt)).toBe('WEBVTT\n\n16\n00:07:35.781 --> 00:07:38.446\nreasonably to a destination\nHave you\n\n17\n00:07:38.447 --> 00:07:41.401\never found\n\n');
    });

    test('battuta malformata (solo tempi, senza numero ne\' testo) scartata, le altre restano', () => {
        const srt = '00:00:01,000 --> 00:00:02,000\n\n2\n00:00:03,000 --> 00:00:04,000\nCiao';
        expect(convert(srt)).toBe('WEBVTT\n\n2\n00:00:03.000 --> 00:00:04.000\nCiao\n\n');
    });

    test('pezzo corrotto con tempi spezzati resta scartato, non incollato alla battuta prima', () => {
        const srt = '650\n00:37:40,000 --> 00:37:41,000\nBerlin?\n\n651\n00:37:41,9rlin?';
        expect(convert(srt)).toBe('WEBVTT\n\n650\n00:37:40.000 --> 00:37:41.000\nBerlin?\n\n');
    });
});

describe('tag di stile (KEEP_STYLE_TAGS)', () => {
    const { KEEP_STYLE_TAGS } = require('../vendor/stremio-video/src/withHTMLSubtitles/casaSubtitlesCleanup');

    test('flag acceso: <i> <b> <u> restano (senza attributi), <font> e il resto no', () => {
        expect(KEEP_STYLE_TAGS).toBe(true);
        const srt = '1\n00:00:01,000 --> 00:00:02,000\n<font color="#ffff00"><i>Hear</i> the <B>bell</B></font> <u>now</u> <i class="x">x</i> <script>y</script>';
        expect(convert(srt)).toBe('WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\n<i>Hear</i> the <b>bell</b> <u>now</u> <i>x</i> y\n\n');
    });
});

test('riga vuota doppia dentro una battuta: il pezzo riattaccato non porta righe vuote', () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\nUno\n\n\ndue\n\n2\n00:00:03,000 --> 00:00:04,000\nTre';
    expect(convert(srt)).toContain('Uno\ndue\n\n2\n');
});
