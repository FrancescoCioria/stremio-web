// Tag di override ASS dentro SRT/VTT (OpenSubtitles, 29/10/2026: "{\an8}" su 58 cue di un
// episodio = "mettilo in alto"): ne' srt2webvtt ne' vtt.js li capiscono, finivano a schermo
// come testo. Si tolgono solo i blocchi che iniziano con "\": una "{" nel dialogo resta.
var ASS_OVERRIDE = /\{\\[^}]*\}/g;

function stripAssOverrides(text) {
    return typeof text === 'string' ? text.replace(ASS_OVERRIDE, '') : text;
}

module.exports = {
    stripAssOverrides: stripAssOverrides
};
