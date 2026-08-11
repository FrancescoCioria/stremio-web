// Copyright (C) 2017-2023 Smart code 203358507
//
// Casa: recupero automatico dall'errore di DECODIFICA del browser.
//
// Il caso reale (2026-08-10 e 2026-08-11, "Backrooms" 2160p HEVC via Tailscale):
// `MEDIA_ERR_DECODE` a meta' film, due volte in due giorni. Nei log era gia'
// tutto scagionato a monte: buffer PIENO e pulito nell'istante del crash (81s e
// 48s avanti, `holes:0`, `readyState:4`), stremio-server che serviva segmenti
// regolarmente fino a 3s prima e dopo, e video `-c:v copy` (il 4K HEVC arriva al
// browser identico all'originale). Ne' posizione fissa nel film (13:07 e 34:39)
// ne' tempo fisso dall'avvio (4m11s e 12m50s) ⇒ non e' un frame corrotto in un
// punto preciso: e' il decoder del browser che molla.
//
// Impedirlo non possiamo (sta fuori dal nostro codice). Recuperarlo si': dopo un
// errore critico stremio-video fa gia' `command('unload')` da solo, e l'unload
// fa `removeAttribute('src')` + `videoElement.load()`, che per spec AZZERA
// `videoElement.error`. L'elemento non resta avvelenato: e' pronto per un load
// nuovo. E' la stessa manovra che [[useStallWatchdog]] fa in prod da mesi.
//
// ⚠️ LA POSIZIONE VA MEMORIZZATA PRIMA. Quell'unload automatico fa anche
// `currentTime = 0` e azzera lo stato: nel log del crash si legge `"time":null`,
// con la posizione vera solo dentro `prev`. Un recupero che leggesse
// `video.state.time` al momento dell'errore ricaricherebbe DALL'INIZIO DEL FILM
// — plausibile, silenzioso e sbagliato. Chi chiama passa l'ultimo tempo buono.
//
// ⚠️ Solo il codice 82. Il codice 83 (`SRC_NOT_SUPPORTED`) NON e' un incidente
// transitorio: e' lo stream che quel browser non sa proprio riprodurre, e
// ritentarlo sarebbe un loop di ricariche che non puo' riuscire.

// `MEDIA_ERR_DECODE` in `vendor/stremio-video/src/error.js`.
const DECODE_ERROR_CODE = 82;

// Cap volutamente per-STREAM, senza reset sul progresso: il conto riparte solo
// quando si carica un altro stream. Se il crash fosse causato da un sample
// specifico, ricaricare dallo stesso secondo lo ripropone -> con un reset "dopo
// che e' ripartito" si tornerebbe in loop. Il prezzo del cap e' che un film
// molto sfortunato, dopo il terzo recupero, torna a mostrare l'errore com'e'
// oggi: mai peggio di adesso. Se il beacon `decode-recovery` mostrera' che il
// cap viene davvero raggiunto, lo si affinera' sui dati invece che a naso.
const MAX_ATTEMPTS = 3;

const initialMemory = () => ({ attempts: 0 });

// Testable internal: nessun React, nessuno stato implicito.
// `error` = l'oggetto emesso da stremio-video ({ code, critical, ... }).
const decodeRecoveryStep = (error, memory) => {
    if (!error || error.critical !== true || error.code !== DECODE_ERROR_CODE) {
        return { memory, recover: false };
    }

    if (memory.attempts >= MAX_ATTEMPTS) {
        return { memory, recover: false };
    }

    return {
        memory: { ...memory, attempts: memory.attempts + 1 },
        recover: true,
        attempt: memory.attempts + 1,
    };
};

module.exports = decodeRecoveryStep;
module.exports.decodeRecoveryStep = decodeRecoveryStep;
module.exports.initialMemory = initialMemory;
module.exports.DECODE_ERROR_CODE = DECODE_ERROR_CODE;
module.exports.MAX_ATTEMPTS = MAX_ATTEMPTS;
