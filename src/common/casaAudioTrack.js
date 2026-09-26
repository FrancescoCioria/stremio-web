// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: traccia audio di default per LINGUA, in qualsiasi notazione.
//
// BUG (President Curtis S1E6, 26/09/2026: partito in francese, originale
// inglese): upstream confrontava `track.lang === lang` oppure il 639-2 del
// codice a 2 lettere della traccia. Pensato per `settings.audioLanguage` a 3
// lettere ("eng") contro tracce a 2 o 3. Da v4.41 la lingua arriva dal backend
// Casa in 639-1 ("en", `language_prefs.ts`), e le tracce dei container sono a
// 3 lettere ("fre", "eng"): nessun match -> il player teneva la PRIMA traccia.
// Qui si riducono entrambi i lati al 639-2 (come `languages.toCode` fa per i
// sottotitoli in useSubtitles.ts).

const langs = require('langs');

const toCode = (code) => {
    if (typeof code !== 'string' || !code.trim()) return null;
    const c = code.trim().toLowerCase();
    const l = langs.all().find((x) => [x['1'], x['2'], x['2B'], x['2T'], x['3']].includes(c));
    return l ? l['2'] : c;
};

const findTrackByLang = (tracks, lang) => {
    const want = toCode(lang);
    if (!want || !Array.isArray(tracks)) return undefined;
    return tracks.find((track) => track && toCode(track.lang) === want);
};

module.exports = { findTrackByLang, toCode };
