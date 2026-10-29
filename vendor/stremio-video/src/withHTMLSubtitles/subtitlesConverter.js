var KEEP_STYLE_TAGS = require('./casaSubtitlesCleanup').KEEP_STYLE_TAGS;

// from: https://github.com/silviapfeiffer/silviapfeiffer.github.io/blob/master/index.html#L150-L216

function srt2webvtt(data) {
    // remove dos newlines
    var srt = data.replace(/\r+/g, '');
    // trim white space start and end
    srt = srt.replace(/^\s+|\s+$/g, '');
    // get cues
    var cuelist = srt.split('\n\n');
    var result = '';
    if (cuelist.length > 0) {
        result += 'WEBVTT\n\n';
        var cues = [];
        for (var i = 0; i < cuelist.length; i = i + 1) {
            // Riga vuota DENTRO una battuta (Paperman, 29/10/2026: 24 volte in un file): il
            // pezzo dopo e' solo testo, senza numero ne' tempi. Prima mandava in eccezione
            // convertSrtCue e si perdeva TUTTA la traccia; ora si riattacca alla battuta prima.
            if (!/\d+:\d+:\d+/.test(cuelist[i])) {
                var last = cues.length - 1;
                var text = cuelist[i].trim();
                if (last >= 0 && /\n\n$/.test(cues[last]) && text.length > 0) {
                    cues[last] = cues[last].replace(/\n\n$/, '\n' + stripHtmlTags(text) + '\n\n');
                }
                continue;
            }

            // Una battuta malformata si scarta da sola, mai l'intero file.
            try {
                cues.push(convertSrtCue(cuelist[i]));
            } catch (error) {
                cues.push('');
            }
        }
        result += cues.join('');
    }
    return result;
}

function stripHtmlTags(text) {
    // remove all html tags for security reasons (tranne <i> <b> <u>, senza attributi, se KEEP_STYLE_TAGS)
    return text.replace(/<[a-zA-Z/][^>]*>/g, function(tag) {
        var style = KEEP_STYLE_TAGS ? /^<(\/?)([ibu])(\s[^>]*)?>$/i.exec(tag) : null;
        return style ? '<' + style[1] + style[2].toLowerCase() + '>' : '';
    });
}

function convertSrtCue(caption) {
    caption = stripHtmlTags(caption);

    var cue = '';
    var s = caption.split(/\n/);
    // concatenate muilt-line string separated in array into one
    while (s.length > 3) {
        for (var i = 3; i < s.length; i++) {
            s[2] += '\n' + s[i];
        }
        s.splice(3, s.length - 3);
    }
    var line = 0;
    // detect identifier
    if (!s[0].match(/\d+:\d+:\d+/) && s[1].match(/\d+:\d+:\d+/)) {
        cue += s[0].match(/\w+/) + '\n';
        line += 1;
    }
    // get time strings
    if (s[line].match(/\d+:\d+:\d+/)) {
        // convert time string
        var m = s[1].match(/(\d+):(\d+):(\d+)(?:,(\d+))?\s*--?>\s*(\d+):(\d+):(\d+)(?:,(\d+))?/);
        if (m) {
            cue += m[1] + ':' + m[2] + ':' + m[3] + '.' + m[4] + ' --> '
                + m[5] + ':' + m[6] + ':' + m[7] + '.' + m[8] + '\n';
            line += 1;
        } else {
            // Unrecognized timestring
            return '';
        }
    } else {
        // file format error or comment lines
        return '';
    }
    // get cue text
    if (s[line]) {
        cue += s[line] + '\n\n';
    }
    return cue;
}

module.exports = {
    convert: function(text) {
        // presume all to be SRT if not WEBVTT
        if (text.includes('WEBVTT')) {
            return text;
        }

        try {
            return srt2webvtt(text);
        } catch (error) {
            throw new Error('Failed to convert srt to webvtt: ' + error.message);
        }
    }
};
