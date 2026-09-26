// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: risoluzione di uno stream dal testo (name/title/filename/bingeGroup):
// max "NNNp" trovato, oppure 2160 per 4k/uhd. 0 = sconosciuta.
// Usata dalla lista torrent (bucket Auto) e da "episodio successivo" (stessa
// risoluzione di quello che stai guardando). Gemella nel backend:
// `heightOf` in launcher/backend/src/stremio_addon.ts.

const RES_RE = /(\d{3,4})\s*p\b/gi;

const streamHeight = (stream) => {
    if (!stream) return 0;
    const bh = stream.behaviorHints || {};
    const text = [stream.name, stream.title, stream.description, bh.filename, bh.bingeGroup].filter(Boolean).join(' ');
    let h = 0, m;
    RES_RE.lastIndex = 0;
    while ((m = RES_RE.exec(text)) !== null) { const v = +m[1]; if (v > h) h = v; }
    if (h === 0 && /\b(?:4k|uhd|2160)\b/i.test(text)) h = 2160;
    return h;
};

module.exports = { streamHeight };
