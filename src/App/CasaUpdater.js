// Copyright (C) 2017-2026 Smart code 203358507
//
// Aggiornamento automatico della tile: controlla se il web server serve un
// bundle piu' recente e, quando e' sicuro farlo, ricarica. Tutta la logica sta
// in common/casaUpdate.js; qui ci sono solo i momenti in cui guardare.
//
// Quando si controlla:
//   - poco dopo l'avvio (non subito: al boot del box la rete e il backend
//     stanno ancora salendo, e un fallimento li' sarebbe solo rumore);
//   - ogni 15 minuti, per l'app installata sul Mac che resta aperta per giorni;
//   - quando la finestra torna in primo piano (throttlata: tornare sull'app
//     dieci volte in un minuto non deve significare dieci richieste).
//
// Quando si applica: appena trovato, se non si sta guardando niente. Altrimenti
// resta in attesa e riparte al cambio di rotta — cioe' all'uscita dal player.

const React = require('react');
const casaUpdate = require('stremio/common/casaUpdate');

const CasaUpdater = () => {
    React.useEffect(() => {
        const tick = (throttleMs) => { void casaUpdate.autoTick(throttleMs); };

        const first = setTimeout(() => tick(), casaUpdate.FIRST_CHECK_DELAY_MS);
        const interval = setInterval(() => tick(), casaUpdate.CHECK_INTERVAL_MS);

        const onVisibility = () => {
            if (document.visibilityState === 'visible') tick(casaUpdate.VISIBILITY_THROTTLE_MS);
        };
        // Uscendo dal player un aggiornamento in attesa diventa applicabile:
        // senza questo resterebbe fermo fino al tick successivo (15 minuti).
        const onHashChange = () => { void casaUpdate.applyPendingIfSafe(); };

        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('hashchange', onHashChange);
        return () => {
            clearTimeout(first);
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('hashchange', onHashChange);
        };
    }, []);

    return null;
};

module.exports = CasaUpdater;
