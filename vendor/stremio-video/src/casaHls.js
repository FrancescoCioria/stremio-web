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

// Analisi del file (formato, tracce): prima il backend di casa (`/casa-hls/probe`,
// hls_probe.ts), poi server.js se il nostro non risponde — il caso peggiore e'
// "come prima". Passo 1 dello spegnimento di server.js (2026-09-28). Stessa forma
// di risposta, verificata sui file della cronologia.
//   localStorage.setItem('casa.probe', 'off')   -> di nuovo solo server.js
var PROBE_FLAG = 'casa.probe';
// ⚠️ NESSUN limite di tempo, ne' qui ne' nel backend: su un torrent freddo
// l'analisi dura quanto lo swarm (A/B 28/09: 3-30 s, mediana 15) e decide chi
// guarda, col telecomando. Uscire dal player annulla la richiesta (`signal`) e il
// backend uccide ffprobe, cosi' non ruba banda al torrent scelto dopo. Prima: 20 s
// che correvano CONTRO il backend (Mac, 20,6 s: rinunciava a un'analisi quasi
// finita), poi 90 s + 30 s nel backend, sempre numeri a caso.

function probeEnabled() {
    try {
        return localStorage.getItem(PROBE_FLAG) !== 'off';
    } catch (_e) {
        return false;
    }
}

function fetchJson(u, signal) {
    return fetch(u, signal ? { signal: signal } : {}).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    });
}

function fetchProbe(streamingServerURL, mediaURL, signal) {
    var q = 'mediaURL=' + encodeURIComponent(mediaURL);
    var fromServer = function() {
        return fetchJson(String(streamingServerURL).replace(/\/$/, '') + '/hlsv2/probe?' + q, signal);
    };
    var origin = casaBackendOrigin();
    if (!probeEnabled() || !origin) return fromServer();
    // server.js solo su un errore VERO del backend, mai se l'annullamento e' nostro
    // (uscita dal player): li' non serve piu' nessuna risposta.
    return fetchJson(origin + '/casa-hls/probe?' + q, signal).catch(function(e) {
        if (signal && signal.aborted) throw e;
        return fromServer();
    });
}

module.exports = { casaMasterUrl: casaMasterUrl, casaBackendOrigin: casaBackendOrigin, fetchProbe: fetchProbe };
