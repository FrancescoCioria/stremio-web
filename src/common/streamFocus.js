// Copyright (C) 2017-2023 Smart code 203358507
//
// Decisione "dove va il focus nella lista stream" (StreamsList), estratta dal
// componente perche' e' pura e perche' e' gia' stata sbagliata una volta.
//
// ⚠️ Regressione 2026-07-11 — `wantKey` (l'ultimo torrent riprodotto, ricordato in
// lastStream.js) e' GLOBALE: un solo slot, NON per-video. Su un film che non hai
// mai aperto, quella chiave e' di un ALTRO film e non e' in questa lista. Il
// codice usciva li' ("nessun match -> nessun danno") lasciando il focus sul NULLA:
// ed e' esattamente dove atterra l'utente quando la race Auto rinuncia e mostra la
// lista manuale -> lista con niente di focalizzato, telecomando che sembra morto.
// Nessun match deve CADERE sul default (prima card), non uscire.
//
// L'altro vincolo, opposto e altrettanto reale: non RUBARE il focus. Se l'utente
// e' gia' dentro la lista (sta navigando) o l'ha portato fuori di proposito
// (sidebar, pill addon) non glielo si strappa indietro a ogni re-sort — i verdetti
// salute rimescolano l'ordine di continuo.
//
// ⚠️ `nothingFocused` e `focusInList` sono DUE cose diverse, e confonderle
// re-introduce il bug da un'altra porta: `focusInList === false` vale sia quando
// l'utente ha portato il focus fuori di proposito (sidebar) sia quando il focus e'
// sul NULLA (`document.activeElement === body`, tipico dopo che l'elemento
// focalizzato viene smontato — es. le card "Auto" spariscono quando la race
// rinuncia e mostra la lista). Nel primo caso non si tocca niente, nel secondo si
// DEVE focalizzare qualcosa. Senza distinguerli, un utente che ha gia' visitato la
// lista una volta (initialFocusDone) ci ricasca: race fallita -> focus nel vuoto.
//
// wantIdx        : indice della card "voluta" (ultimo torrent riprodotto), -1 se
//                  non c'e' o non e' in questa lista
// nothingFocused : nessun elemento ha il focus (activeElement = body)
// focusInList    : il focus e' su una card di questa lista
// focusIsWanted  : ...ed e' proprio la card voluta
//
// Ritorna:
//   'reassert-want' -> (ri)focalizza la card voluta: ritorno dal player, o focus
//                      perso da un remount
//   'drop-want'     -> l'utente si e' spostato su un'altra card: molla la chiave e
//                      non toccare piu' nulla
//   'focus-first'   -> niente di focalizzato: prima card (il default)
//   'keep-in-view'  -> l'utente sta navigando la lista: solo scroll, mai focus
//   'none'          -> il focus e' altrove di proposito (sidebar): non rubarlo
const decideStreamFocus = ({ wantIdx, nothingFocused, focusInList, focusIsWanted }) => {
    // Il focus e' vivo FUORI dalla lista: l'utente ce l'ha portato lui. Non si
    // scippa, nemmeno per ri-asserire la card voluta (i verdetti salute rimescolano
    // la lista di continuo: sarebbe uno strappo ogni pochi secondi).
    if (!nothingFocused && !focusInList) return 'none';
    if (wantIdx >= 0) return (focusInList && !focusIsWanted) ? 'drop-want' : 'reassert-want';
    if (focusInList) return 'keep-in-view';
    // Qui il focus e' sul nulla: non c'e' nessuno a cui rubarlo -> prima card.
    // Prima questo ramo era gated da un flag "focus iniziale gia' fatto", che
    // serviva a non scippare l'utente; ma quel compito ce l'ha gia' la riga sopra,
    // e il flag si limitava a lasciare il focus nel vuoto dopo ogni smontaggio.
    return 'focus-first';
};

module.exports = { decideStreamFocus };
