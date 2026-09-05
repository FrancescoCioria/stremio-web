// Copyright (C) 2017-2026 Smart code 203358507
//
// Safari "Aggiungi al Dock" (macOS) ripristina l'ultima pagina vista quando
// l'app viene chiusa del tutto (Cmd+Q) e riaperta — stesso restore-tab di
// Safari, applicato alla finestra dedicata dell'app. Per un film vuol dire
// riaprire dritti nel player di un episodio lasciato a meta': imprevedibile
// quanto un "riprendi" che nessuno ha premuto (stessa filosofia della smart
// TV illusion — vedi [[project_smart_tv_illusion]]).
//
// Un vero riavvio dell'app e' un CARICAMENTO DI PAGINA nuovo di zecca: il
// sessionStorage nasce vuoto (sopravvive a un semplice reload nella stessa
// sessione, MA NON a Safari che chiude e ricrea il processo). Se il
// marcatore manca, e' la primissima volta in questo processo → si forza la
// Home; se c'e' gia', e' solo un re-render o una navigazione interna e non
// si tocca nulla (chi apre Settings o naviga nel player resta dov'e').
const React = require('react');
const { useNavigate, useLocation } = require('react-router');

const BOOT_MARKER = 'casa.appBooted';
const HOME_PATH = '/';

const CasaHomeOnColdStart = () => {
    const navigate = useNavigate();
    const location = useLocation();

    React.useEffect(() => {
        let alreadyBooted = false;
        try {
            alreadyBooted = window.sessionStorage.getItem(BOOT_MARKER) === '1';
            window.sessionStorage.setItem(BOOT_MARKER, '1');
        } catch (_e) {
            // storage bloccato (rarissimo, es. private mode restrittivo): meglio
            // non forzare nulla che rompere il boot dell'app per questo.
            return;
        }
        if (!alreadyBooted && location.pathname !== HOME_PATH) {
            navigate({ pathname: HOME_PATH, search: location.search }, { replace: true });
        }
        // Solo al mount: vogliamo SOLO il path con cui l'app e' partita.
    }, []);

    return null;
};

module.exports = CasaHomeOnColdStart;
