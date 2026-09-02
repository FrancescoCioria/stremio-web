// Dove il player va a prendere la MASTER PLAYLIST.
//
// ⚠️ Vive QUI dentro, nel package vendorizzato, e si importa con un require
// RELATIVO: da `vendor/` un `require('stremio/common/...')` dipenderebbe
// dall'alias webpack di stremio-web, cioe' da una configurazione esterna al
// package. Il file lo compila il webpack di stremio-web, ma non deve dipendere
// da come ha risolto gli alias.
//
// ⚠️ stremio-server perde 1-4 fotogrammi in coda ad alcuni segmenti video di
// /hlsv2: il player si pianta sul buco, hls.js ci salta sopra e si vede uno
// scatto (310 congelamenti visibili in 23 giorni, 5,6 minuti di video fermo).
// Misurato il 2026-09-02: il file grezzo ha 0 buchi, ffmpeg da solo 0 buchi,
// /hlsv2 3. Il backend di casa rigenera la sola rendition VIDEO e serve un
// master che manda video0 a noi e lascia audio, sottotitoli, probe e settings
// a server.js. Verificato end-to-end: 2641 pacchetti, 0 buchi.
//
// ⚠️ L'interruttore vive in localStorage, non in una costante: si spegne dalla
// console della tile in un secondo, senza ricompilare e senza andare alla TV.
//   localStorage.setItem('casa.hlsVideo', 'off')   -> torna tutto a server.js
// Il valore di default e' ACCESO; qualsiasi valore diverso da 'off' e' acceso.
var FLAG = 'casa.hlsVideo';

function enabled() {
    try {
        return localStorage.getItem(FLAG) !== 'off';
    } catch (e) {
        // Storage negato (finestra privata, permessi): si sceglie server.js,
        // cioe' il comportamento storico. In dubbio non si sperimenta.
        return false;
    }
}

// Il backend sta sulla stessa macchina della tile, porta 8765. Stessa
// derivazione di useTitleAvailability: hardcodare localhost rompe l'accesso
// dal Mac via Tailscale, dove la pagina arriva da un altro host.
function casaBackendOrigin() {
    var h = typeof window !== 'undefined' && window.location ? window.location.hostname : null;
    if (!h) return null;
    return window.location.protocol + '//' + h + ':8765';
}

// `fallback` e' l'URL che si userebbe senza di noi: si ritorna quello ogni
// volta che qualcosa non torna, cosi' il caso peggiore e' "come prima".
function casaMasterUrl(fallback, id, query) {
    if (!enabled() || !id) return fallback;
    var origin = casaBackendOrigin();
    if (!origin) return fallback;
    return origin + '/casa-hls/' + id + '/master.m3u8?' + query;
}

module.exports = { casaMasterUrl: casaMasterUrl, casaBackendOrigin: casaBackendOrigin };
