// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: stato e testi della card episodio della pagina SERIE (handoff Claude
// Design "Series Detail", 2026-09-21). Puro, testabile
// (tests/casaEpisodeCard.spec.js). Il disegno sta in components/Video.
//
// UN valore solo sceglie il trattamento della card:
//   watched    — gia' visto: miniatura vera, badge "VISTO"
//   inProgress — lasciato a meta': anello verde, badge "IN CORSO", barra
//   available  — uscito e non visto: miniatura, nessun badge
//   upcoming   — non ancora uscito: NIENTE miniatura e niente icona play
//
// ⚠️ Un episodio futuro NON e' riproducibile. Prima la card mostrava
// un'icona play grigia al posto della miniatura, che sembrava un'immagine
// non caricata E prometteva una riproduzione: OK apriva la scelta dei torrent
// di un episodio che non esiste ancora.

const { isKnownFuture } = require('./casaEpisodeFocus');

const episodeState = (video, now = Date.now()) => {
    if (!video) return 'available';
    if (video.watched === true) return 'watched';
    if (typeof video.progress === 'number' && video.progress > 0) return 'inProgress';
    if (isKnownFuture(video, now)) return 'upcoming';
    return 'available';
};

const validDate = (d) => d instanceof Date && !isNaN(d.getTime());

// "16 set 2026" — la data come la scrive l'handoff, in italiano.
const formatDate = (d) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\.$/, '');

// "DAL 30 SET" nel riquadro dell'episodio futuro. Senza data niente riga:
// meglio tacere che scrivere una data inventata.
const upcomingAirLabel = (released) => {
    if (!validDate(released)) return null;
    const month = released.toLocaleDateString('it-IT', { month: 'short' }).replace(/\.$/, '');
    return `DAL ${released.getDate()} ${month.toUpperCase()}`;
};

// La riga sotto il titolo. `runtime` = minuti REALI dell'episodio (TMDB, via
// useEpisodeRuntimes) o null: senza, la durata si OMETTE — mai il runtime
// nominale della serie, che su Cinemeta e' uguale per tutti gli episodi e
// spesso lontano dal vero (The Last of Us dichiara 56, vanno da 46 a 81).
const episodeMeta = (video, runtime, now = Date.now()) => {
    const state = episodeState(video, now);
    if (state === 'upcoming') return 'In arrivo';
    const parts = [];
    if (validDate(video.released)) parts.push(formatDate(video.released));
    if (typeof runtime === 'number' && runtime > 0) {
        if (state === 'inProgress') {
            const left = Math.max(1, Math.round(runtime * (1 - video.progress / 100)));
            parts.push(`${left} min rimanenti`);
        } else {
            parts.push(`${runtime} min`);
        }
    }
    return parts.join(' · ');
};

// "03": il numero nel riquadro dell'episodio futuro.
const paddedEpisode = (episode) => (typeof episode === 'number' && !isNaN(episode) ? String(episode).padStart(2, '0') : '');

module.exports = { episodeState, episodeMeta, upcomingAirLabel, paddedEpisode };
