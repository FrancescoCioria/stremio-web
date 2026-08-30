// Copyright (C) 2017-2026 Smart code 203358507

const fs = require('fs');
const path = require('path');
const { isContextMenuChord, contextMenuEventInit } = require('../src/common/casaRemoteInput');

describe('isContextMenuChord', () => {
    it('aggancia il chord del telecomando quando il browser riporta key e code', () => {
        expect(isContextMenuChord({ ctrlKey: true, shiftKey: true, code: 'F13', key: 'F13' })).toBe(true);
    });

    // Il motivo per cui si guardano ENTRAMBI: su Linux/XKB F13 puo' non avere
    // keysym -> `key` e' 'Unidentified'. Un match sul solo `key` (com'era in
    // MetaItem) non aggancia mai in Firefox, cioe' nella tile vera.
    it('aggancia il chord anche se key e\' Unidentified (solo code)', () => {
        expect(isContextMenuChord({ ctrlKey: true, shiftKey: true, code: 'F13', key: 'Unidentified' })).toBe(true);
    });

    it('aggancia il chord anche senza code (solo key)', () => {
        expect(isContextMenuChord({ ctrlKey: true, shiftKey: true, key: 'F13' })).toBe(true);
    });

    it('aggancia i tasti menu di una tastiera fisica, senza modificatori', () => {
        expect(isContextMenuChord({ key: 'ContextMenu' })).toBe(true);
        expect(isContextMenuChord({ key: 'Menu' })).toBe(true);
    });

    it('NON aggancia F13 nudo o a meta\' chord', () => {
        expect(isContextMenuChord({ code: 'F13', key: 'F13' })).toBe(false);
        expect(isContextMenuChord({ ctrlKey: true, code: 'F13', key: 'F13' })).toBe(false);
        expect(isContextMenuChord({ shiftKey: true, code: 'F13', key: 'F13' })).toBe(false);
    });

    it('NON aggancia altri tasti col chord premuto', () => {
        expect(isContextMenuChord({ ctrlKey: true, shiftKey: true, code: 'F12', key: 'F12' })).toBe(false);
        expect(isContextMenuChord({ ctrlKey: true, shiftKey: true, code: 'KeyS', key: 's' })).toBe(false);
    });

    it('non esplode su input degeneri', () => {
        expect(isContextMenuChord(null)).toBe(false);
        expect(isContextMenuChord({})).toBe(false);
    });
});

describe('contextMenuEventInit', () => {
    it('mette il menu al CENTRO dell\'elemento a fuoco (un tasto non ha coordinate)', () => {
        const init = contextMenuEventInit({ left: 100, top: 200, width: 300, height: 100 });
        expect([init.clientX, init.clientY]).toEqual([250, 250]);
    });

    it('senza rect ripiega su 0,0 invece di esplodere', () => {
        expect(contextMenuEventInit(null).clientX).toBe(0);
    });

    // Deve sembrare un tasto destro qualsiasi: Video.js salta il preventDefault
    // quando ctrlKey e' true (ctrl+click = menu contestuale su macOS).
    it('non propaga i modificatori del chord', () => {
        const init = contextMenuEventInit(null);
        expect(init.ctrlKey).toBeUndefined();
        expect(init.shiftKey).toBeUndefined();
        expect(init.bubbles).toBe(true);
    });
});

// L'invariante che rende telecomando e mouse davvero interscambiabili: il chord
// e' conosciuto in UN SOLO posto (il ponte) piu' la tabella delle shortcut. Se
// ricompare in un componente, quel componente ha una strada tutta sua che sul
// Mac nessuno prova.
describe('nessun match su F13 sparso nel codice', () => {
    const walk = (dir, out = []) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full, out);
            else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
        }
        return out;
    };

    it('solo casaRemoteInput.js nomina F13', () => {
        const src = path.join(__dirname, '..', 'src');
        const offenders = walk(src)
            .filter((file) => path.basename(file) !== 'casaRemoteInput.js')
            .filter((file) => /['"`]F13['"`]/.test(fs.readFileSync(file, 'utf8')));
        expect(offenders).toEqual([]);
    });
});
