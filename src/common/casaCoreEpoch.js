// Copyright (C) 2017-2026 Smart code 203358507

// Casa: contatore che segna "il contesto del core e' cambiato sotto ai piedi
// delle richieste in corso" — oggi solo l'autologin di CasaAutoSetup.
//
// ⚠️ Il difetto che risolve (visto in prod il 2026-09-01, 21:01): la tile parte
// OSPITE, l'utente cerca subito, e mentre i cataloghi caricano arriva
// l'autologin. Il login cambia collezione addon e settings, le richieste in
// volo vengono annullate, e le righe restano con "Env: Failed to fetch: Load
// failed" — per sempre, finche' non si ridigita: nessuno le ritenta. Sembra la
// ricerca rotta, ed e' invece una corsa che dura un secondo.
//
// ⚠️ E' stocastico: dipende da quanto ci mette il backend a coniare il token
// contro quanto ci mettono gli addon a rispondere. Misurato su profilo vergine
// il 2026-09-01: 1 caso su 3 alla prima ricerca, 0 su 3 a profilo gia'
// autenticato. Un test solo non lo vede — vanno ripetuti.
//
// L'epoch entra nella `action` dei modelli che caricano cataloghi: cambiando
// identita', `useModelState` ri-dispatcha il Load con il contesto nuovo. Niente
// reload della pagina, niente stato da riconciliare a mano.

const React = require('react');

let epoch = 0;
const listeners = new Set();

const bumpCoreEpoch = () => {
    epoch += 1;
    listeners.forEach((listener) => listener(epoch));
};

const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const getCoreEpoch = () => epoch;

const useCoreEpoch = () => {
    const [value, setValue] = React.useState(epoch);
    React.useEffect(() => subscribe(setValue), []);
    return value;
};

module.exports = { bumpCoreEpoch, getCoreEpoch, useCoreEpoch };
