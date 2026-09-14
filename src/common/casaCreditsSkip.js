// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: "Continue Watching" su un episodio fermo nei TITOLI DI CODA -> apre
// l'episodio successivo, non la sigla.
//
// Il caso reale (Silo S3, settembre 2026): l'episodio si ferma durante la
// sigla finale, la tile viene chiusa (Home; la notte il processo muore), il
// giorno dopo Continue Watching riapre LO STESSO episodio al 98%. Successo
// per E03 (07/09 -> 09/09), E05 (09/09 -> 13/09), E07 (14/09).
//
// La regola esiste GIA' nel core di Stremio (`item_state_update` in
// models/player.rs): se `time_offset > duration * CREDITS_THRESHOLD_COEF`
// azzera l'offset e avanza la library al video successivo. Ma gira SOLO su
// `Unload` del player: con la tile uccisa a player montato non arriva mai.
//
// ⚠️ La decisione si prende SULLA CARD, al click, non nel player. Dalla v4.104
// alla v4.109 la card apriva il player dell'episodio vecchio e il player saltava
// al successivo appena il core esponeva `nextVideo`: si vedeva E08 per un attimo
// prima di E09. Il successivo pero' non e' un dato che solo il player conosce:
// e' la lista episodi del titolo, e la card la puo' chiedere da sola.
// ⚠️ E la percentuale e' quella DELLA CARD (`progress` = time_offset/duration*100
// calcolato dal core): nel libraryItem del player la `duration` non e'
// serializzata, ed e' il motivo per cui la v4.104 non e' mai scattata.
//
// Si va alla pagina TORRENT del successivo, non al suo player: lo stream "gemello"
// (stesso bingeGroup) il core lo sceglie solo dentro il player, e quasi sempre
// non c'e' comunque (Silo E09: no-binge-match).
//
// Nessuna scrittura nostra sulla library: la card resta sull'episodio vecchio
// finche' non si fa partire il successivo, e ogni click rifa' lo stesso salto.
//
// Da un episodio scelto a mano nella lista episodi non si salta niente: la regola
// vive solo nel click della card. Successivo non ancora uscito -> si riprende
// dalla sigla, come prima.

// = CREDITS_THRESHOLD_COEF di stremio-core (src/constants.rs).
const CREDITS_THRESHOLD_COEF = 0.9;

const seasonOf = (video) => (video && Number.isFinite(Number(video.season)) ? Number(video.season) : 0);

// = MetaItem::next_video di stremio-core (types/resource/meta_item.rs): il video
// DOPO nell'ordine della lista, se uscito (senza data = uscito), senza entrare
// negli speciali della stagione 0 da una stagione normale.
const nextVideoAfter = (videos, videoId, now) => {
    if (!Array.isArray(videos) || typeof videoId !== 'string') return null;
    const pos = videos.findIndex((v) => v && v.id === videoId);
    if (pos < 0) return null;
    const current = videos[pos];
    const next = videos[pos + 1];
    if (!next || typeof next.id !== 'string') return null;
    const releasedAt = next.released ? Date.parse(next.released) : NaN;
    const released = Number.isNaN(releasedAt) || releasedAt <= now;
    const specialsJump = seasonOf(next) === 0 && seasonOf(current) !== 0;
    return released && !specialsJump ? next : null;
};

// `progress` = percentuale 0-100 della card, come la calcola il core.
// `videos` = lista episodi del titolo (null se non e' arrivata).
const decideCreditsSkip = ({ progress, videoId, videos, now }) => {
    if (!(Number(progress) > CREDITS_THRESHOLD_COEF * 100)) return { skip: false, reason: 'not-in-credits' };
    if (typeof videoId !== 'string' || !videoId) return { skip: false, reason: 'no-video-id' };
    if (!Array.isArray(videos)) return { skip: false, reason: 'no-meta' };
    const next = nextVideoAfter(videos, videoId, now);
    if (!next) return { skip: false, reason: 'no-next-video' };
    return { skip: true, reason: 'credits', next };
};

// Serve andare in rete solo per le card nei titoli di coda: le altre si aprono
// come sempre, senza aspettare niente.
const needsCreditsCheck = (progress, type) =>
    type === 'series' && Number(progress) > CREDITS_THRESHOLD_COEF * 100;

module.exports = { decideCreditsSkip, nextVideoAfter, needsCreditsCheck, CREDITS_THRESHOLD_COEF };
