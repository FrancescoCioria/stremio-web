// Copyright (C) 2017-2023 Smart code 203358507

const EventEmitter = require('eventemitter3');

function KeyboardShortcuts() {
    let active = false;

    const events = new EventEmitter();

    function onKeyDown(event) {
        if (event.keyboardShortcutPrevented || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
            return;
        }

        // Su INPUT/TEXTAREA skippiamo i tasti che interferirebbero col
        // typing (Digit0-6 navigazione, Backspace back). Esc invece DEVE
        // funzionare anche con focus su input — caso tipico: campo
        // ricerca, l'utente preme Back/Esc per uscire dalla pagina, non
        // per annullare l'input.
        const isInput = event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA';
        if (isInput && event.code !== 'Escape') {
            return;
        }

        switch (event.code) {
            case 'Digit0': {
                event.preventDefault();
                window.location = '#/search';
                break;
            }
            case 'Digit1': {
                event.preventDefault();
                window.location = '#/';
                break;
            }
            case 'Digit2': {
                event.preventDefault();
                window.location = '#/discover';
                break;
            }
            case 'Digit3': {
                event.preventDefault();
                window.location = '#/library';
                break;
            }
            case 'Digit4': {
                event.preventDefault();
                window.location = '#/calendar';
                break;
            }
            case 'Digit5': {
                event.preventDefault();
                window.location = '#/addons';
                break;
            }
            case 'Digit6': {
                event.preventDefault();
                window.location = '#/settings';
                break;
            }
            case 'Backspace': {
                event.preventDefault();
                if (event.ctrlKey) {
                    window.history.forward();
                } else {
                    window.history.back();
                }

                break;
            }
            case 'Escape': {
                // TV: tasto B del controller -> Esc. Se c'e' una modale
                // aperta, ModalDialog.js gestisce gia' la chiusura (listener
                // separato). Se NON c'e' modale, facciamo history.back()
                // cosi' da TV "B" si comporta come "indietro" universale.
                const modalsContainer = document.querySelector('.modals-container');
                // childElementCount === 1 e' solo il lock-div di focus-trap
                // che esiste sempre; > 1 vuol dire modale attiva.
                const modalOpen = !!modalsContainer && modalsContainer.childElementCount > 1;
                if (modalOpen) break;
                event.preventDefault();
                window.history.back();
                break;
            }
        }
    }
    function onStateChanged() {
        events.emit('stateChanged');
    }

    Object.defineProperties(this, {
        active: {
            configurable: false,
            enumerable: true,
            get: function() {
                return active;
            }
        }
    });

    this.start = function() {
        if (active) {
            return;
        }

        window.addEventListener('keydown', onKeyDown);
        active = true;
        onStateChanged();
    };
    this.stop = function() {
        window.removeEventListener('keydown', onKeyDown);
        active = false;
        onStateChanged();
    };
}

module.exports = KeyboardShortcuts;
