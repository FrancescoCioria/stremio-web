// Copyright (C) 2017-2026 Smart code 203358507

// Le tracce esterne (OpenSubtitles) che il core espone sono quelle di un ALTRO
// video? Vedi la guardia in useSubtitles.ts. Pura, testata.
// Stantie = e' cambiato il VIDEO ma la lista e' identica all'ultima aggiunta
// (al cambio episodio il core espone per ~1 s quelle del precedente). Lo
// STESSO video ricaricato (nuovo stream) con la stessa lista NON e' stantio:
// le tracce vanno riaggiunte al player nuovo.
const isStaleSubtitles = (last, videoId, sig) =>
    last !== null && last !== undefined && last.videoId !== videoId && last.sig === sig;

module.exports = { isStaleSubtitles };
