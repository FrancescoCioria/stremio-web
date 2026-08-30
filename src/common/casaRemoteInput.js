// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: PONTE telecomando -> eventi standard del browser.
//
// Obiettivo: telecomando e tastiera/mouse devono essere INTERSCAMBIABILI, cosi'
// che una prova fatta sul Mac valga anche in salotto. La quasi totalita' dei
// tasti lo e' gia' per costruzione, perche' `remote2kb` li emette come tasti
// veri: frecce -> frecce, OK -> Enter, Back -> Escape. Il resto (volume,
// play/pausa, Home, mic) non arriva nemmeno al browser: va in HTTP al backend.
//
// ⚠️ Restava UNA divergenza, ed e' esattamente quella che si e' rotta: il tasto
// **Menu**. `remote2kb`/`gamepad2kb` lo emettono come chord **Ctrl+Shift+F13**
// (F13 e KEY_MENU nudi li intercetta KDE, vedi launcher/scripts/CLAUDE.md), che
// nessun mouse produce: i componenti finivano per implementare DUE strade per
// lo stesso gesto — `onContextMenu` per il tasto destro e un match su F13 per
// il telecomando — e la seconda non la testava nessuno.
//
// ⚠️ La seconda strada era anche SBAGLIATA: matchava `event.key === 'F13'`. Su
// Linux/XKB i tasti F13-F24 non hanno keysym, quindi il browser puo' riportare
// `key: 'Unidentified'` con `code: 'F13'`. Il launcher (Brave/Chromium) matcha
// su `key` e funziona; la tile Stremio gira in FIREFOX dal 2026-06-20 — motore
// diverso, mapping diverso. Qui si guardano ENTRAMBI.
//
// Soluzione: il chord viene tradotto UNA VOLTA SOLA, qui, in un evento
// `contextmenu` sintetico sull'elemento a fuoco. Da li' in giu' esiste un solo
// percorso — quello del tasto destro — e ogni componente che implementa
// `onContextMenu` supporta il telecomando GRATIS, senza saperlo: quello che
// provi col mouse sul Mac e' letteralmente il codice che gira in salotto.

// Il chord del telecomando, piu' i tasti "menu" veri di una tastiera fisica.
const isContextMenuChord = (event) => {
    if (!event) return false;
    // 'ContextMenu' e' lo standard, 'Menu' il nome legacy (stessa lista di
    // TileGrid.tsx nel launcher). Nessun modificatore: sono tasti dedicati.
    if (event.key === 'ContextMenu' || event.key === 'Menu') return true;
    if (!event.ctrlKey || !event.shiftKey) return false;
    return event.code === 'F13' || event.key === 'F13';
};

// Init dell'evento sintetico: un tasto non ha coordinate, quindi si usa il
// CENTRO dell'elemento a fuoco. Serve davvero: `ContextMenu.tsx` posiziona il
// menu su `clientX/clientY`, e con (0,0) uscirebbe nell'angolo dello schermo.
// ⚠️ `ctrlKey`/`shiftKey` NON si propagano: a valle deve sembrare un tasto
// destro qualsiasi (`Video.js` salta il preventDefault se ctrlKey e' true, che
// su macOS e' il modo di fare "click destro" col trackpad).
const contextMenuEventInit = (rect) => ({
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 2,
    buttons: 2,
    clientX: rect ? Math.round(rect.left + rect.width / 2) : 0,
    clientY: rect ? Math.round(rect.top + rect.height / 2) : 0,
});

// ⚠️ Il ponte AGGIUNGE l'evento, non consuma il tasto: niente preventDefault,
// niente stopPropagation. Il chord ha gia' un altro significato legittimo nel
// PLAYER — `shortcuts.json` lo lega a `subtitlesMenu`, cioe' il tasto Menu
// durante un film apre i sottotitoli — e quel binding sta nella tabella delle
// shortcut, non sparso nei componenti. Consumare l'evento qui lo ucciderebbe.
// (Li' non nasce un doppio menu: il `contextmenu` del player e' agganciato ai
// ref del contenitore video, e a fuoco c'e' il body o un bottone della barra.)
const onKeyDownCapture = (event) => {
    if (!isContextMenuChord(event)) return;
    const target = document.activeElement instanceof Element ? document.activeElement : document.body;
    if (!target) return;
    const rect = typeof target.getBoundingClientRect === 'function' ? target.getBoundingClientRect() : null;
    target.dispatchEvent(new MouseEvent('contextmenu', {
        ...contextMenuEventInit(rect),
        view: window,
    }));
};

let installed = false;

const installCasaRemoteInput = () => {
    if (installed || typeof document === 'undefined') return;
    installed = true;
    // Capture: il `contextmenu` sintetico deve partire prima che l'app veda il
    // keydown, cosi' l'ordine degli eventi e' lo stesso di un tasto destro vero.
    document.addEventListener('keydown', onKeyDownCapture, true);
};

module.exports = { isContextMenuChord, contextMenuEventInit, installCasaRemoteInput };
