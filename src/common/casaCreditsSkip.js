// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: "Continue Watching" su un episodio fermo nei TITOLI DI CODA -> apre
// l'episodio successivo, non la sigla.
//
// Il caso reale (Silo S3, settembre 2026): l'episodio si ferma durante la
// sigla finale, la tile viene chiusa (Home; la notte il processo muore), il
// giorno dopo Continue Watching riapre LO STESSO episodio al 98%. Successo
// per E03 (07/09 -> 09/09) e per E05 (09/09 -> 13/09).
//
// La regola esiste GIA' nel core di Stremio (`item_state_update` in
// models/player.rs): se `time_offset > duration * CREDITS_THRESHOLD_COEF`
// azzera l'offset e avanza la library al video successivo. Ma gira SOLO su
// `Unload` del player (e al Load di un item diverso): con la tile uccisa a
// player montato l'Unload non arriva mai, e la library resta ferma sulla
// sigla. Quando il video arriva davvero alla FINE (`ended`) il flusso e'
// diverso e funziona: e' il caso "mi fermo a 30 secondi dalla fine" che
// resta scoperto.
//
// Qui si replica la stessa soglia del core (0.9, non un numero nostro) nel
// momento in cui possiamo ancora decidere: all'ingresso nel player DA
// Continue Watching (`?casaFrom=cw`). Da un episodio scelto a mano nella
// lista episodi non si salta niente: chi riapre apposta E05 vuole E05.
// Il salto e' la stessa navigazione del bottone "episodio successivo"; il
// player di E05 si smonta, il core riceve l'Unload e applica da solo la sua
// regola (offset a 0, library avanzata): nessuna scrittura nostra sulla
// library.
//
// Se il successivo non esiste ancora (non uscito, o fine stagione) non c'e'
// niente di meglio da offrire: si riprende dalla sigla, come oggi.

// = CREDITS_THRESHOLD_COEF di stremio-core (src/constants.rs).
const CREDITS_THRESHOLD_COEF = 0.9;

const shouldSkipCredits = ({ fromContinueWatching, libraryItem, selectedVideoId, nextVideo }) => {
    if (!fromContinueWatching) return { skip: false, reason: 'not-from-cw' };
    const state = libraryItem && libraryItem.state;
    if (!state || !selectedVideoId || state.video_id !== selectedVideoId) {
        return { skip: false, reason: 'library-not-on-this-video' };
    }
    const duration = Number(state.duration);
    const timeOffset = Number(state.timeOffset);
    if (!(duration > 0) || !(timeOffset > duration * CREDITS_THRESHOLD_COEF)) {
        return { skip: false, reason: 'not-in-credits' };
    }
    const dl = nextVideo && nextVideo.deepLinks;
    if (!dl || (typeof dl.player !== 'string' && typeof dl.metaDetailsStreams !== 'string')) {
        return { skip: false, reason: 'no-next-video' };
    }
    return { skip: true, reason: 'credits' };
};

module.exports = { shouldSkipCredits, CREDITS_THRESHOLD_COEF };
