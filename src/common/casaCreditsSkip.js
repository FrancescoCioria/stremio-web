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

// = CREDITS_THRESHOLD_COEF di stremio-core (src/constants.rs). Resta solo come
// ripiego quando la durata non e' nota (vedi isInCredits).
const CREDITS_THRESHOLD_COEF = 0.9;

// "E' nei titoli di coda?" = UNA decisione, per serie e film.
//
// In MINUTI, non in percentuale (regola utente, 03/10/2026): un episodio da
// 20 min ha ~2 min di titoli (10%), un film di 3h ~10 min (5,5%). Il 10% del
// core su un film di 3h sono 18 minuti, cioe' il finale. Retta per quei due
// punti: titoli = 1 min + 5% della durata (45 min -> 3,3; 2h -> 7; 3h -> 10).
//
// Sui dati del 03/10 (fermi davanti alla TV, poi tile chiusa da fuori):
// Superman 0 min dalla fine su 129 (soglia 7,5), Coyote vs. Acme 4,4 su 103
// (6,1), Sorry Baby 3,2 su 103 (6,2), Eternity 5,5 su 114 (6,7) -> dentro.
// Bugonia 8,6 su 119 (7,0) -> fuori: o era ancora film, o la sigla e' lunga.
// ⚠️ Valori iniziali dalla regola dell'utente, non tarati su un corpus.
const CREDITS_BASE_MS = 60 * 1000;
const CREDITS_PER_RUNTIME = 0.05;

// `progress` = percentuale 0-100 della card; `durationMs` = durata del video
// della card (dal backend, `durations` di /stremio-addon/watchlist). Senza
// durata si torna alla soglia del core.
const isInCredits = (progress, durationMs) => {
    const p = Number(progress);
    if (!(p > 0)) return false;
    const d = Number(durationMs);
    if (!(d > 0)) return p > CREDITS_THRESHOLD_COEF * 100;
    const remainingMs = (1 - p / 100) * d;
    return remainingMs <= CREDITS_BASE_MS + CREDITS_PER_RUNTIME * d;
};

// Durata della card SOLO se descrive lo stesso video: la library del backend
// e' in cache 1h e per una serie puo' essere ancora sull'episodio prima.
const durationFor = (entry, videoId) =>
    entry && entry.duration > 0 && (!entry.videoId || entry.videoId === videoId) ? entry.duration : null;

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
const decideCreditsSkip = ({ progress, durationMs, videoId, videos, now }) => {
    if (!isInCredits(progress, durationMs)) return { skip: false, reason: 'not-in-credits' };
    if (typeof videoId !== 'string' || !videoId) return { skip: false, reason: 'no-video-id' };
    if (!Array.isArray(videos)) return { skip: false, reason: 'no-meta' };
    const next = nextVideoAfter(videos, videoId, now);
    if (!next) return { skip: false, reason: 'no-next-video' };
    return { skip: true, reason: 'credits', next };
};

// Serve andare in rete solo per le card nei titoli di coda: le altre si aprono
// come sempre, senza aspettare niente.
const needsCreditsCheck = (progress, type, durationMs) =>
    type === 'series' && isInCredits(progress, durationMs);

// FILM fermo nei titoli di coda: fuori da Continue Watching.
//
// Il core lo toglie da solo (offset azzerato oltre la soglia) ma solo su
// `Unload` del player, che con la tile chiusa da fuori non arriva: al 03/10
// 5 film visti fino in fondo restavano in riga (Superman al 99,96%). Le serie
// no: li' la card serve ancora, porta al successivo (decideCreditsSkip).
// Nessuna scrittura sulla library: altrove (telefono) restano come sono.
// `durations` = mappa del backend { [id]: { videoId, duration } }.
const isFinishedMovie = (item, durations) => {
    if (!item || item.type !== 'movie') return false;
    const id = item._id || item.id;
    const d = durations && durations[id];
    // Senza durata nota non si decide (ripiego del core = 90%: proprio la
    // percentuale che sbaglia sui film lunghi).
    if (!d || !(d.duration > 0)) return false;
    return isInCredits(item.progress, d.duration);
};

// Serie in Continue Watching SOLO per una notifica di nuovo episodio: il core
// ce la mette anche a posizione 0 (`library_items_update`: in CW oppure con
// notifiche), e il suo link `player` punta allo stream dell'ultimo episodio
// aperto, gia' FINITO (lo prende dallo streams bucket locale, senza guardare la
// posizione). X Factor 2026-09-24: E03 uscito in serata, la card finiva su una
// pagina torrent vuota invece che sulla serie. Si va alla pagina serie, dove il
// nuovo episodio e' gia' quello in evidenza.
const isNotificationOnly = (progress, newVideos) => newVideos > 0 && !(Number(progress) > 0);

module.exports = { decideCreditsSkip, nextVideoAfter, needsCreditsCheck, isNotificationOnly, isInCredits, isFinishedMovie, durationFor, CREDITS_THRESHOLD_COEF };
