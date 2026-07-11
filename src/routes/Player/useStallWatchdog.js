// Copyright (C) 2017-2023 Smart code 203358507
//
// Casa: watchdog anti-stallo del player.
//
// Il caso reale (2026-07-11, Off Campus S01E02 su un pack x265): hls.js carica
// il PRIMO frammento e poi non chiede piu' nulla — nessun errore, nessuna
// eccezione, buffer vuoto, `readyState=0`. Il player resta in `buffering` per
// ORE. Verificato che a monte era tutto sano (TorrServer serviva i byte in
// millisecondi, server.js produceva i segmenti in ~1s, lo stesso stream girava
// in hls.js standalone nello stesso Firefox, con la stessa config e la stessa
// versione). In hls.js c'e' un solo modo di comportarsi cosi': un append nel
// MediaSource che non si completa mai -> il loader aspetta all'infinito. E'
// intermittente: lo stesso stream, ricaricato, parte.
//
// Non essendoci un errore da intercettare, l'unica cura e' accorgersi che non
// si muove nulla e RICARICARE lo stream dallo stesso punto (unload + load =
// istanza hls nuova). Prima di questo, la "cura" era riavviare la tile a mano.
//
// Volutamente conservativo: un torrent lento e' indistinguibile da uno stallo,
// quindi (a) le finestre di attesa crescono, (b) i tentativi sono limitati, e
// (c) qualunque progresso (tempo che avanza, o buffering che si spegne) azzera
// tutto. Nel peggiore dei casi paghiamo qualche secondo di ricarica; nel caso
// buono l'utente non resta davanti a uno schermo fermo.

const React = require('react');
// Path relativo, non l'alias `stremio/...`: questo modulo lo importano anche i
// test sotto jest/node, dove l'alias di webpack non esiste (come torrentRace.js).
const { casaBeacon } = require('../../common/casaBackend');

// Attesa prima di ogni tentativo (ms). Cresce: se il primo reload non e'
// bastato, il problema potrebbe essere lo swarm -> non accanirsi.
const STALL_WINDOWS_MS = [25000, 60000, 120000];
const MAX_ATTEMPTS = STALL_WINDOWS_MS.length;
const TICK_MS = 5000;

const initialMemory = () => ({
    lastTime: null,
    lastProgressAt: null,
    attempts: 0,
});

// Testable internal: nessun React, nessun tempo implicito.
// `state` = { loaded, buffering, time }; `now` = ms.
const stallWatchdogStep = (state, memory, now) => {
    const stalled = state.loaded === true &&
        state.buffering === true &&
        state.time === memory.lastTime;

    if (!stalled) {
        // Progresso (o non ancora caricato): reset. Gli attempts si azzerano
        // solo quando il video scorre davvero, non al primo frame bufferizzato.
        const playing = state.buffering === false && state.time !== memory.lastTime;
        return {
            memory: {
                lastTime: state.time,
                lastProgressAt: now,
                attempts: playing ? 0 : memory.attempts,
            },
            reload: false,
        };
    }

    if (memory.lastProgressAt === null) {
        return { memory: { ...memory, lastProgressAt: now }, reload: false };
    }

    const stalledForMs = now - memory.lastProgressAt;
    const window = STALL_WINDOWS_MS[Math.min(memory.attempts, MAX_ATTEMPTS - 1)];

    if (memory.attempts >= MAX_ATTEMPTS || stalledForMs < window) {
        return { memory, reload: false };
    }

    return {
        memory: { ...memory, lastProgressAt: now, attempts: memory.attempts + 1 },
        reload: true,
        stalledForMs,
        attempt: memory.attempts + 1,
    };
};

// `reload(time)` deve rifare unload+load sullo stesso stream, dal punto passato.
const useStallWatchdog = (videoState, reload) => {
    const memory = React.useRef(initialMemory());
    const reloadRef = React.useRef(reload);
    reloadRef.current = reload;

    const streamKey = videoState.stream ? JSON.stringify(videoState.stream).slice(0, 200) : null;

    // Stream diverso = storia diversa: azzera, altrimenti gli attempts del
    // titolo precedente si portano dietro il conto e il watchdog nasce sordo.
    React.useEffect(() => {
        memory.current = initialMemory();
    }, [streamKey]);

    React.useEffect(() => {
        if (streamKey === null) return;

        const interval = setInterval(() => {
            const state = {
                loaded: videoState.loaded,
                buffering: videoState.buffering,
                time: videoState.time,
            };
            const result = stallWatchdogStep(state, memory.current, Date.now());
            memory.current = result.memory;

            if (result.reload) {
                casaBeacon('/debug/player-event', {
                    ev: 'stall-watchdog',
                    action: 'reload',
                    attempt: result.attempt,
                    stalledForMs: result.stalledForMs,
                    time: state.time,
                });
                reloadRef.current(state.time);
            }
        }, TICK_MS);

        return () => clearInterval(interval);
    }, [streamKey, videoState.loaded, videoState.buffering, videoState.time]);
};

module.exports = useStallWatchdog;
module.exports.stallWatchdogStep = stallWatchdogStep;
module.exports.initialMemory = initialMemory;
module.exports.STALL_WINDOWS_MS = STALL_WINDOWS_MS;
