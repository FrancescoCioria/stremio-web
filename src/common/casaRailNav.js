// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: lo scroll orizzontale di un rail guidato da telecomando. UN SOLO posto
// — era nato in Board.js e la lista episodi se n'era fatta una copia che
// ri-centrava la card a OGNI freccia, cioe' il comportamento che Board aveva
// gia' buttato via. Due copie divergono e finiscono con buchi complementari.
//
// ⚠️ Il bersaglio non e' la card a fuoco ma quella SUCCESSIVA nella direzione
// di marcia: cosi' resta sempre almeno una card INTERA visibile oltre quella
// selezionata, e si vede dove si sta andando invece di scoprirlo dopo aver
// premuto. Scorrendo solo quando la card a fuoco tocca il bordo, l'utente
// naviga guardando un muro.
//
// ⚠️ Sull'ULTIMA card la card successiva non esiste: al suo posto si mostra lo
// SPAZIO VUOTO dove starebbe (il `::after` del rail), cosi' il ritmo visivo e'
// identico e la fine della riga non e' una sbattuta contro il bordo destro.
// Senza quello spazio nel DOM non ci sarebbe niente da scrollare: `scrollWidth`
// finisce con l'ultima card.
//
// ⚠️ NIENTE `scroll-snap-type` sui rail che passano di qui: il browser
// ri-aggancia allo snap point al focus/scale della card e da' un micro-balzo
// (~15px) avanti/indietro a ogni freccia.

const RAIL_REVEAL_PAD = 32;

// La lista episodi avvolge ogni card in un wrapper `display: contents` (esiste
// solo per portare `data-video-id`): non ha box, quindi rect e larghezza vanno
// presi dal figlio. `getClientRects()` vuoto e' il segno di `display: contents`
// senza doverne calcolare lo stile.
const boxOf = (el) => {
    if (!el) return null;
    if (typeof el.getClientRects !== 'function' || el.getClientRects().length > 0) return el;
    // Senza box: si scende al figlio SOLO se ce l'ha davvero un box. Un
    // elemento ancora non disposto (o nascosto) non ha rect ne' lui ne' i
    // figli, e li' si torna l'elemento com'era invece di inventarsi un
    // bersaglio — e' il caso delle card della home che remontano.
    const child = el.firstElementChild;
    return child && child.getClientRects().length > 0 ? child : el;
};

// Larghezza del vuoto di coda = una card + il gap. Si ricava dalla card vera
// invece di scriverla in CSS perche' i rail hanno forme diverse (poster 14rem,
// landscape 24rem, episodio) e il contenitore non puo' selezionare per la
// forma dei propri figli.
const ensureRailTrail = (rowScroll, card) => {
    const box = boxOf(card);
    if (!rowScroll || !box) return 0;
    const gap = parseFloat(getComputedStyle(rowScroll).columnGap) || 0;
    const trail = Math.round(box.getBoundingClientRect().width + gap);
    if (!trail) return 0;
    if (rowScroll.dataset.casaTrail !== String(trail)) {
        rowScroll.style.setProperty('--casa-rail-trail', `${trail}px`);
        rowScroll.dataset.casaTrail = String(trail);
    }
    return trail;
};

// `dir`: +1 freccia destra, -1 freccia sinistra, 0 ingresso dall'alto/basso
// (li' vale solo "rendi visibile", senza anticipo in una direzione sola).
const revealCardInRail = (rowScroll, card, dir = 0) => {
    if (!rowScroll || !card) return;
    const trail = ensureRailTrail(rowScroll, card);
    if (!card.previousElementSibling) {
        rowScroll.scrollTo({ left: 0, behavior: 'smooth' });
        return;
    }
    const box = boxOf(card);
    if (!box) return;
    const railRect = rowScroll.getBoundingClientRect();
    const cardRect = box.getBoundingClientRect();
    const next = boxOf(card.nextElementSibling);
    const prev = boxOf(card.previousElementSibling);
    const rightTarget = next ? next.getBoundingClientRect().right : cardRect.right + trail;
    const leftTarget = prev ? prev.getBoundingClientRect().left : cardRect.left - trail;
    if (dir >= 0 && rightTarget > railRect.right - RAIL_REVEAL_PAD) {
        rowScroll.scrollBy({ left: rightTarget - railRect.right + RAIL_REVEAL_PAD, behavior: 'smooth' });
    } else if (dir <= 0 && leftTarget < railRect.left + RAIL_REVEAL_PAD) {
        rowScroll.scrollBy({ left: leftTarget - railRect.left - RAIL_REVEAL_PAD, behavior: 'smooth' });
    }
};

module.exports = { revealCardInRail };
