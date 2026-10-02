// Casa: un segmento che non arriva NON deve fermare il film.
//
// Il caso reale (2026-10-02, Superman 4K): alle 20:13:58 il backend risponde 502
// a un segmento video; hls.js ritenta 6 volte in ~0,1 s (`maxRetryDelayMs: 15`
// ereditato da Stremio in hlsConfig.js) e dichiara l'errore FATALE. Da li' hls.js
// smette di caricare per sempre (`stopLoad` in error-controller) e nessuno lo
// riaccende: il film va avanti sui ~200 s di buffer e poi si pianta in silenzio,
// con TorrServer a 25 peer e il segmento che il backend avrebbe rigenerato in 2 s.
//
// Cosa fa, solo su errore FATALE di caricamento di un frammento (video o audio):
//   - frammento LONTANO dalla testina (c'e' buffer davanti): si ritenta piu' tardi
//     con `hls.startLoad()`, attese crescenti. Il buffer copre l'attesa: gratis.
//   - frammento SOTTO la testina: un ultimo tentativo dopo NEAR_RETRY_MS, poi lo si
//     SALTA (currentTime oltre la sua fine + startLoad da li'). Si perdono i suoi
//     secondi (~10 s di film per un segmento video), non il film.
//   - MAX_SKIPS salti di fila senza un solo frammento caricato in mezzo = la fonte
//     e' morta (backend giu', torrent sparito): ci si ferma, saltare ancora
//     farebbe scorrere il film a vuoto.
// Ogni decisione lascia `ev:"casa-frag-recovery"` in stremio-player-debug.log.

var beacon = require('./casaHlsProbe').beacon;

var NEAR_S = 3;              // frammento che inizia entro 3 s dalla testina = "sotto"
var NEAR_RETRY_MS = 2000;    // un tentativo prima di saltare: il backend rigenera
var FAR_RETRY_MS = 4000;     // primo ritento con buffer davanti, poi raddoppia...
var FAR_RETRY_MAX_MS = 30000; // ...fino a qui (film in pausa per ore: niente raffica)
var SKIP_PAD_S = 0.1;        // atterra DENTRO il frammento successivo, non sul confine
var MAX_SKIPS = 3;

var initialMemory = function() {
    return { skips: { main: 0, audio: 0 }, farRetries: { main: 0, audio: 0 }, nearTried: {} };
};

var withCount = function(counts, type, n) {
    var out = Object.assign({}, counts);
    out[type] = n;
    return out;
};

// Testable internal: niente hls.js, niente DOM, niente orologio.
// input: { kind: 'loaded', type } | { kind: 'error', time, rate?, frag: { type, sn, start, end } }
// ⚠️ Salti contati PER TRACCIA e azzerati solo da un frammento della STESSA: con
// video morto e audio sano, l'audio che carica non deve riarmare i salti del video
// (il film scorrerebbe a vuoto 10 s alla volta). `nearTried` non si azzera mai per
// lo stesso motivo (un ultimo tentativo a frammento, non uno a ogni audio caricato).
// ⚠️ L'attesa del ritento "lontano" non supera il buffer rimasto (review 02/10): con
// 20 s davanti e un'attesa di 30 s il film si fermava ~10 s sul buco prima di saltare.
// action: null | { type: 'retry', delayMs } | { type: 'skip', to } | { type: 'give-up' }
var fragRecoveryStep = function(memory, input) {
    if (input.kind === 'loaded') {
        if (!(input.type in memory.skips)) return { memory: memory, action: null };
        return {
            memory: { skips: withCount(memory.skips, input.type, 0), farRetries: withCount(memory.farRetries, input.type, 0), nearTried: memory.nearTried },
            action: null
        };
    }
    var frag = input.frag;
    if (input.kind !== 'error' || !frag || !(frag.type in memory.skips) || typeof frag.start !== 'number' || typeof frag.end !== 'number') {
        return { memory: memory, action: null };
    }
    if (frag.start - input.time > NEAR_S) {
        var n = memory.farRetries[frag.type];
        var rate = input.rate > 0 ? input.rate : 1;
        var untilNearMs = (frag.start - input.time - NEAR_S) * 1000 / rate;
        var delayMs = Math.round(Math.min(FAR_RETRY_MS * Math.pow(2, n), FAR_RETRY_MAX_MS, untilNearMs));
        return {
            memory: { skips: memory.skips, farRetries: withCount(memory.farRetries, frag.type, n + 1), nearTried: memory.nearTried },
            action: { type: 'retry', delayMs: delayMs }
        };
    }
    var key = frag.type + ':' + frag.sn;
    if (!memory.nearTried[key]) {
        var nearTried = Object.assign({}, memory.nearTried);
        nearTried[key] = true;
        return {
            memory: { skips: memory.skips, farRetries: memory.farRetries, nearTried: nearTried },
            action: { type: 'retry', delayMs: NEAR_RETRY_MS }
        };
    }
    var skips = memory.skips[frag.type];
    if (skips >= MAX_SKIPS) {
        return { memory: memory, action: { type: 'give-up' } };
    }
    return {
        memory: { skips: withCount(memory.skips, frag.type, skips + 1), farRetries: memory.farRetries, nearTried: memory.nearTried },
        action: { type: 'skip', to: Math.max(frag.end, input.time) + SKIP_PAD_S }
    };
};

function casaFragRecovery(hls, videoElement, Hls) {
    var memory = initialMemory();
    var timer = null;
    var stopped = false;   // caricamento fermo per un nostro errore fatale, non ancora riacceso

    function clearTimer() {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    }

    function restart(position) {
        clearTimer();
        stopped = false;
        hls.startLoad(position);
    }

    // ⚠️ Solo segmenti veri (`sn` numerico): l'init servito da cache mentre i segmenti
    // danno 502 riarmerebbe i salti all'infinito (review 02/10).
    function onFragLoaded(_event, data) {
        if (!data || !data.frag || typeof data.frag.sn !== 'number') return;
        if (data.frag.type !== 'main' && data.frag.type !== 'audio') return;
        memory = fragRecoveryStep(memory, { kind: 'loaded', type: data.frag.type }).memory;
    }

    function onError(_event, data) {
        if (!data || !data.fatal || data.type !== Hls.ErrorTypes.NETWORK_ERROR) return;
        if (data.details !== Hls.ErrorDetails.FRAG_LOAD_ERROR && data.details !== Hls.ErrorDetails.FRAG_LOAD_TIMEOUT) return;
        var frag = data.frag;
        if (!frag || (frag.type !== 'main' && frag.type !== 'audio')) return;
        var time = videoElement.currentTime;
        stopped = true;
        var step = fragRecoveryStep(memory, {
            kind: 'error',
            time: time,
            rate: videoElement.playbackRate,
            frag: { type: frag.type, sn: frag.sn, start: frag.start, end: frag.end }
        });
        memory = step.memory;
        var action = step.action;
        if (!action) return;
        beacon({
            ev: 'casa-frag-recovery',
            action: action.type,
            delayMs: action.delayMs,
            to: action.to,
            details: data.details,
            code: data.response && typeof data.response.code === 'number' ? data.response.code : null,
            frag: { type: frag.type, sn: frag.sn, start: frag.start, end: frag.end },
            time: time,
            skips: memory.skips[frag.type]
        });
        clearTimer();
        if (action.type === 'retry') {
            timer = setTimeout(function() {
                timer = null;
                restart(-1);
            }, action.delayMs);
        } else if (action.type === 'skip') {
            videoElement.currentTime = action.to;
            restart(action.to);
        }
    }

    // ⚠️ hls.js fermo non riparte su una seek dell'utente (onMediaSeeking non carica
    // a caricamento spento): la seek restava appesa fino al timer, o per sempre dopo
    // `give-up`. Una seek e' una richiesta esplicita: si riaccende subito da li'.
    function onSeeking() {
        if (stopped) restart(-1);
    }

    hls.on(Hls.Events.ERROR, onError);
    hls.on(Hls.Events.FRAG_LOADED, onFragLoaded);
    videoElement.addEventListener('seeking', onSeeking);

    return function destroy() {
        clearTimer();
        videoElement.removeEventListener('seeking', onSeeking);
        hls.off(Hls.Events.ERROR, onError);
        hls.off(Hls.Events.FRAG_LOADED, onFragLoaded);
    };
}

module.exports = casaFragRecovery;
module.exports.fragRecoveryStep = fragRecoveryStep;
module.exports.initialMemory = initialMemory;
module.exports.MAX_SKIPS = MAX_SKIPS;
