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
// ⚠️ Il FE ASPETTA il BE: il limite vero e' del backend (ffprobe 30 s, poi 502
// esplicito, hls_probe.ts PROBE_TIMEOUT_MS). Questo e' solo una rete contro una
// connessione appesa, volutamente molto piu' larga. Era 20 s e correva CONTRO il
// backend (2026-09-28, Mac, torrent freddo): 4 s di metadata + 16 s per i primi
// pezzi = 20,6 s, la tile rinunciava a 20,0 e chiedeva a server.js, che rispondeva
// "subito" solo coi byte appena scaricati dalla nostra ffprobe. Senza server.js
// sarebbe stato un errore su un'analisi che stava per riuscire.
var CASA_PROBE_TIMEOUT_MS = 90000;

function probeEnabled() {
    try {
        return localStorage.getItem(PROBE_FLAG) !== 'off';
    } catch (_e) {
        return false;
    }
}

function fetchJson(u, timeoutMs) {
    var opts = {};
    if (timeoutMs && typeof AbortController !== 'undefined') {
        var ctrl = new AbortController();
        setTimeout(function() { ctrl.abort(); }, timeoutMs);
        opts.signal = ctrl.signal;
    }
    return fetch(u, opts).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    });
}

function fetchProbe(streamingServerURL, mediaURL) {
    var q = 'mediaURL=' + encodeURIComponent(mediaURL);
    var fromServer = function() {
        return fetchJson(String(streamingServerURL).replace(/\/$/, '') + '/hlsv2/probe?' + q);
    };
    var origin = casaBackendOrigin();
    if (!probeEnabled() || !origin) return fromServer();
    // server.js solo su un errore VERO del backend (o sulla rete di 90 s), mai in
    // gara: su un torrent freddo aspetta i primi byte quanto noi.
    return fetchJson(origin + '/casa-hls/probe?' + q, CASA_PROBE_TIMEOUT_MS).catch(fromServer);
}

module.exports = { casaMasterUrl: casaMasterUrl, casaBackendOrigin: casaBackendOrigin, fetchProbe: fetchProbe };
