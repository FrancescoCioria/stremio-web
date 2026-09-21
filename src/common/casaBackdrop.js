// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: quale immagine fa da SFONDO alla pagina serie (handoff Claude Design,
// 2026-09-21: "cross-fade the backdrop to the focused episode's still").
// Puro, testabile (tests/casaBackdrop.spec.js).
//
// La foto dell'episodio (in evidenza, o a fuoco) al posto dello sfondo della
// serie — con due eccezioni:
// - ⚠️ SPOILER: con "nascondi spoiler" attivo la card di un episodio non visto
//   ha la miniatura SFOCATA apposta; mostrarla nitida a tutto schermo come
//   sfondo annullerebbe la scelta dell'utente. Li' resta lo sfondo della serie.
// - niente foto (episodio senza miniatura, riga extra): sfondo della serie.
//
// ⚠️ RISOLUZIONE: la miniatura di Cinemeta e' `episodes.metahub.space/.../
// w780.jpg`, un redirect a TMDB a 780x439 — tirata a tutto schermo su un 4K
// e' sfocata, e piu' morbida dello sfondo della serie che c'era (1920x1080).
// Lo stesso indirizzo con `w1280.jpg` rimanda alla taglia 1280 di TMDB.
// ⚠️ NON `original.jpg`: 3840x2160 ma ~1,9 MB contro 134 KB (misurato), su un
// WiFi che consegna ~21 Mbps lo sfondo arrivava ~0,7 s dopo la card e ogni
// sosta ne scaricava uno — mentre sotto parte un torrent. Lo sfondo sta sotto
// gli scrim: la differenza oltre 1280 non si vede, il ritardo si'.

const METAHUB_STILL = /^(https:\/\/episodes\.metahub\.space\/[^?#]+\/)w\d+\.jpg$/;

const stillUrl = (thumbnail) => {
    if (typeof thumbnail !== 'string' || thumbnail.length === 0) return null;
    const m = thumbnail.match(METAHUB_STILL);
    return m ? `${m[1]}w1280.jpg` : thumbnail;
};

const backdropFor = ({ video, background, hideSpoilers }) => {
    const fallback = typeof background === 'string' && background.length > 0 ? background : null;
    if (!video) return fallback;
    if (hideSpoilers && video.watched !== true) return fallback;
    return stillUrl(video.thumbnail) || fallback;
};

module.exports = { backdropFor, stillUrl };
