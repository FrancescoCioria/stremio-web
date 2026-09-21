// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: la navigazione da telecomando di una pagina a RIGHE — verticale fra
// righe, orizzontale dentro la riga — condivisa fra la lista episodi
// (VideosList, una riga per stagione) e la lista torrent (StreamsList, una
// riga per qualita'). UN SOLO posto: la lista episodi e' nata con una copia
// locale della nav della home e ci e' costata quattro difetti che la home
// aveva gia' risolto (vedi casaRailNav.js).
//
// Parametrizzata sui selettori, cosi' ogni pagina tiene i suoi attributi:
//   rowSel  — una riga            (es. '[data-season-row]')
//   railSel — la rail della riga  (es. '[data-season-rail]')
//   cardSel — una card nella rail (es. '[data-video-id]')
//
// Le regole, ognuna con la sua cicatrice:
// - i tasti si CONSUMANO SEMPRE, anche quando non c'e' dove andare: se no lo
//   spatial-navigation polyfill (keydown su window, attivo solo con
//   !defaultPrevented) porta il focus fuori dalla lista e la pagina scrolla
//   da sola. E costa in proporzione ai focalizzabili della pagina: ~2 s sulla
//   TV con tutte le stagioni montate (misurato 2026-09-21);
// - il bordo della riga e' un MURO: una freccia di troppo non consumata finisce
//   allo scroll nativo, che ANNULLA lo smooth scroll in corso (tasto tenuto =
//   rail fermo a meta' strada, misurato 2026-09-20);
// - memoria dell'ultima card per riga: tornando su una riga si ritrova la
//   colonna dove si era, non la prima card (fuori schermo, "niente a fuoco");
// - si vede SEMPRE una riga vicina (revealRow).

const { revealCardInRail } = require('./casaRailNav');

const focusCard = (card) => {
    const el = card.querySelector('[tabindex], a, button') || card;
    el.focus({ preventScroll: true });
};

// ⚠️ Si vede SEMPRE una riga vicina: quella DOPO se c'e', altrimenti quella
// PRIMA. E' il rovescio verticale del vuoto di coda delle rail — dove puoi
// andare non si scopre premendo, si vede. Sull'ultima riga `block:'end'` la
// incolla in basso e lascia sbucare la precedente; sulle altre `block:'start'`
// porta il titolo in cima e la successiva sbuca sotto. scrollIntoView e non
// conti a mano: rispetta `scroll-margin-top/bottom`, cioe' i cuscinetti stanno
// nel CSS accanto alle misure a cui appartengono.
// ⚠️ "C'e' una riga dopo" si chiede a una RIGA (rowSel), non a un fratello
// qualsiasi: un footer aggiunto un giorno darebbe 'start' all'ultima riga in
// silenzio. ⚠️ Una riga piu' alta dello scroller (finestra bassa) con 'end'
// avrebbe il titolo tagliato: li' 'start'.
const revealRow = (row, behavior, rowSel) => {
    if (!row) return;
    const next = row.nextElementSibling;
    const isLast = !(next && next.matches(rowSel));
    const scroller = row.parentElement;
    const fits = !scroller || row.offsetHeight <= scroller.clientHeight;
    row.scrollIntoView({ behavior, block: isLast && fits ? 'end' : 'start' });
};

// Porta il focus su una card e la mette in vista (riga + rail).
const landOn = (card, { rowSel, railSel, lastCardByRow, behavior = 'smooth' }) => {
    const row = card.closest(rowSel);
    focusCard(card);
    if (!row) return;
    lastCardByRow.set(row, card);
    revealRow(row, behavior, rowSel);
    revealCardInRail(row.querySelector(railSel), card, 0);
};

// Il gestore dei tasti. Ritorna senza fare niente se il tasto non e' una
// freccia o non parte da una riga. `onExitUp(e)`: cosa fare con ArrowUp dalla
// PRIMA riga (tipicamente: salire sull'hero); l'evento e' gia' consumato.
const handleRowsKeyDown = (e, { root, rowSel, railSel, cardSel, lastCardByRow, onExitUp }) => {
    const isVertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
    const isHorizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
    if ((!isVertical && !isHorizontal) || !root) return;
    const currentRow = e.target.closest(rowSel);
    if (!currentRow || !root.contains(currentRow)) return;

    if (isVertical) {
        e.preventDefault();
        e.stopPropagation();
        const rows = [...root.querySelectorAll(rowSel)];
        const idx = rows.indexOf(currentRow);
        const target = e.key === 'ArrowDown' ? rows[idx + 1] : rows[idx - 1];
        if (!target) {
            if (e.key === 'ArrowUp' && typeof onExitUp === 'function') onExitUp(e);
            return;
        }
        const remembered = lastCardByRow.get(target);
        const card = (remembered && target.contains(remembered)) ? remembered : target.querySelector(cardSel);
        if (!card) return;
        focusCard(card);
        lastCardByRow.set(target, card);
        revealRow(target, 'smooth', rowSel);
        revealCardInRail(target.querySelector(railSel), card, 0);
        return;
    }

    const current = e.target.closest(cardSel);
    if (!current) return;
    e.preventDefault();
    e.stopPropagation();
    const sibling = e.key === 'ArrowRight' ? current.nextElementSibling : current.previousElementSibling;
    if (!sibling || !sibling.matches(cardSel)) return;
    focusCard(sibling);
    lastCardByRow.set(currentRow, sibling);
    revealCardInRail(currentRow.querySelector(railSel), sibling, e.key === 'ArrowRight' ? 1 : -1);
};

// Il primo pulsante dell'hero sopra la lista (Riprendi sulla pagina serie, la
// prima azione di MetaPreview sui film), o null.
const heroFirstAction = (from) => {
    const content = from && from.closest('[class*="metadetails-content"]');
    return content?.querySelector('[data-casa-hero-actions] [data-hero-action]') ||
        content?.querySelector('[class*="action-buttons-container"] [tabindex], [class*="action-buttons-container"] a, [class*="action-buttons-container"] button') ||
        null;
};

module.exports = { handleRowsKeyDown, revealRow, landOn, focusCard, heroFirstAction };
