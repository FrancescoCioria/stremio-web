// L'epoch e' il segnale "il contesto del core e' cambiato": chi carica
// cataloghi lo mette nelle dipendenze della sua action e rifa' il Load.
// Senza, le richieste annullate dall'autologin restano sull'errore.

const { bumpCoreEpoch, getCoreEpoch } = require('../src/common/casaCoreEpoch');

describe('casaCoreEpoch', () => {
    test('parte da un valore stabile e cresce ad ogni bump', () => {
        const start = getCoreEpoch();
        bumpCoreEpoch();
        expect(getCoreEpoch()).toBe(start + 1);
        bumpCoreEpoch();
        expect(getCoreEpoch()).toBe(start + 2);
    });

    test('un bump cambia l\'identita\' di una action memoizzata sull\'epoch', () => {
        // Simula il useMemo: stessa query, epoch diverso -> oggetto nuovo.
        const buildAction = (query, epoch) => ({ action: 'Load', args: { query }, epoch });
        const before = buildAction('ghost', getCoreEpoch());
        bumpCoreEpoch();
        const after = buildAction('ghost', getCoreEpoch());
        expect(after).not.toEqual(before);
    });
});
