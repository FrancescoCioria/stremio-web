// Pulizia del testo delle cue (tracce extra: OpenSubtitles, copie Casa). Misure su 155 SRT
// OpenSubtitles visti dalla tile fra agosto e ottobre 2026 (29/10/2026).

// Tag di override ASS dentro SRT/VTT ("{\an8}" = "mettilo in alto", 26 file su 155): ne'
// srt2webvtt ne' vtt.js li capiscono, finivano a schermo come testo. Si tolgono solo i
// blocchi che iniziano con "\": una "{" nel dialogo resta.
var ASS_OVERRIDE = /\{\\[^}]*\}/g;

function stripAssOverrides(text) {
    return text.replace(ASS_OVERRIDE, '');
}

// UTF-8 letto come Windows-1252 e salvato di nuovo ("justâ€¦" invece di "just…", 16 file su
// 155, ~490 cue; nei file colpiti il carattere giusto non compare mai). Ogni sequenza
// sospetta si riporta ai byte cp1252 e si ridecodifica come UTF-8: si sostituisce solo se
// esce UN carattere Latin-1 o di punteggiatura: "ADAPTAÇÃO", un CJK per caso o l'italiano
// "È…" (= U+0205, Latin Extended-B) restano com'erano.
var CP1252_SPECIALS = {
    '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86,
    '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C,
    'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
    '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B,
    'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F
};
var CONTINUATION = '[\\u0080-\\u00BF' + Object.keys(CP1252_SPECIALS).join('') + ']';
var MOJIBAKE = new RegExp('[\\u00C2-\\u00EF]' + CONTINUATION + '{1,2}', 'g');
var UTF8_DECODER = typeof TextDecoder === 'function' ? new TextDecoder('utf-8', { fatal: true }) : null;

function cp1252Byte(char) {
    var code = char.charCodeAt(0);
    return code <= 0xFF ? code : CP1252_SPECIALS[char];
}

function isLatinOrPunctuation(char) {
    var code = char.charCodeAt(0);
    return (code >= 0xA0 && code <= 0xFF) || (code >= 0x2010 && code <= 0x206F) || code === 0x20AC || code === 0x2122;
}

function fixMojibake(text) {
    if (UTF8_DECODER === null) {
        return text;
    }

    return text.replace(MOJIBAKE, function(match) {
        var length = match.charCodeAt(0) >= 0xE0 ? 3 : 2;
        if (match.length < length) {
            return match;
        }

        var bytes = new Uint8Array(length);
        for (var i = 0; i < length; i++) {
            bytes[i] = cp1252Byte(match[i]);
        }

        var decoded;
        try {
            decoded = UTF8_DECODER.decode(bytes);
        } catch (error) {
            return match;
        }

        return decoded.length === 1 && isLatinOrPunctuation(decoded) ? decoded + match.slice(length) : match;
    });
}

function cleanCueText(text) {
    return typeof text === 'string' ? fixMojibake(stripAssOverrides(text)) : text;
}

module.exports = {
    cleanCueText: cleanCueText,
    stripAssOverrides: stripAssOverrides,
    fixMojibake: fixMojibake
};
