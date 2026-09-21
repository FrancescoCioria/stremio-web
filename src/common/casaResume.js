// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: il pulsante PRIMARIO della pagina serie (handoff Claude Design,
// 2026-09-21: "the single biggest fix — the old screen had no primary action
// at all"). Puro, testabile (tests/casaResume.spec.js).
//
// Riguarda l'episodio "in evidenza" = quello su cui atterra l'auto-focus
// (pickFocusVideo): lasciato a meta' -> Riprendi; da iniziare -> Guarda;
// stagione tutta vista (l'auto-focus ripiega sull'ultimo visto) -> Rivedi.
// Un episodio futuro NON e' riproducibile: niente pulsante.

const { episodeState } = require('./casaEpisodeCard');

const code = (v) => `S${String(v.season).padStart(2, '0')}E${String(v.episode).padStart(2, '0')}`;

const resumeAction = (featured, runtime, now = Date.now()) => {
    if (!featured) return null;
    const state = episodeState(featured, now);
    if (state === 'upcoming') return null;
    if (state === 'inProgress') {
        const left = typeof runtime === 'number' && runtime > 0
            ? `${Math.max(1, Math.round(runtime * (1 - featured.progress / 100)))} min rimanenti`
            : code(featured);
        return { kind: 'resume', label: 'Riprendi', sublabel: left, progress: Math.min(100, featured.progress) };
    }
    if (state === 'watched') return { kind: 'rewatch', label: 'Rivedi', sublabel: code(featured), progress: null };
    return { kind: 'watch', label: 'Guarda', sublabel: code(featured), progress: null };
};

// Dove porta: dritto al player se il core ha gia' uno stream per l'episodio
// (e' lo stesso ordine che segue la card: Video.js prova `player` prima di
// `metaDetailsStreams`), altrimenti alla scelta del torrent.
const resumeHref = (featured) => {
    const links = featured && featured.deepLinks;
    if (!links) return null;
    if (typeof links.player === 'string') return links.player;
    if (typeof links.metaDetailsStreams === 'string') return links.metaDetailsStreams;
    return null;
};

module.exports = { resumeAction, resumeHref };
