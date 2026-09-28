// Copyright (C) 2017-2026 Smart code 203358507

// Scritte della CASA (UI in italiano, qualunque sia la lingua di Stremio), passate
// da i18next come quelle upstream: il test `tests/i18nScan.test.js` vieta il testo
// scritto nel JSX. `src/index.js` le unisce a OGNI lingua caricata, cosi' a schermo
// resta esattamente la stessa scritta di prima. Una nuova scritta nostra = una
// chiave qui + `t('CASA_...')` nel componente.
module.exports = {
    CASA_IN_CINEMA: 'Al Cinema',
    CASA_MINUTES: 'min',
    CASA_WATCHED: 'VISTO',
    CASA_IN_PROGRESS: 'IN CORSO',
    CASA_WATCH: 'Guarda',
    CASA_DIRECTOR: 'Regista',
    CASA_CAST: 'Cast',
    CASA_TRAILER: 'Trailer',
    CASA_NOTIFICATIONS: 'Notifiche',
    CASA_REMOVE_FROM_LIBRARY: 'Rimuovi dalla libreria',
    CASA_REMOVE_FROM_LIBRARY_QUESTION: 'Rimuovere dalla libreria?',
    CASA_CANCEL: 'Annulla',
    CASA_REMOVE: 'Rimuovi',
    CASA_STREAM_PACK: 'RACCOLTA',
    CASA_STREAM_DEAD: 'MORTO',
    CASA_STREAM_CHECKING: 'VERIFICO…',
    CASA_STREAM_OK: 'OK',
    CASA_FIRE_TV: 'Fire TV',
    CASA_FINDING_SOURCE: 'Cerco la sorgente migliore…',
    CASA_DOWNLOADED: 'Scaricato',
    CASA_BUFFER: 'Buffer',
    CASA_LABEL: 'Casa',
};
