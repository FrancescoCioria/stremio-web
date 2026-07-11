// Dove va il focus nella lista stream (StreamsList).
//
// Regressione 2026-07-11: sulla lista manuale NON veniva focalizzato NULLA -> col
// telecomando sembrava che la pagina non rispondesse. E' la schermata su cui si
// atterra ogni volta che la race "Auto" rinuncia, quindi si vedeva di continuo.
// Due cause, entrambe coperte qui:
//   1. `wantKey` (ultimo torrent riprodotto) e' una memoria GLOBALE, non per-video:
//      su un altro film non matcha, e il codice usciva li' invece di cadere sulla
//      prima card;
//   2. il ramo "focus gia' piazzato una volta" non distingueva "l'utente ha portato
//      il focus altrove" (non toccare) da "il focus e' sul NULLA perche' l'elemento
//      che ce l'aveva e' stato smontato" (focalizza), e nel dubbio non faceva nulla.

const { decideStreamFocus } = require('../src/common/streamFocus');

// Default = focus sul nulla (activeElement === body): lo stato in cui ti lascia lo
// smontaggio delle card "Auto" quando la race rinuncia.
const decide = (o) => decideStreamFocus(Object.assign(
    { wantIdx: -1, nothingFocused: true, focusInList: false, focusIsWanted: false }, o
));

describe('decideStreamFocus', () => {
    it('lista appena aperta, niente da ricordare -> prima card (REGRESSIONE: era "nessuno")', () => {
        expect(decide({ wantIdx: -1 })).toBe('focus-first');
    });

    it('il torrent ricordato e\' di un ALTRO film -> comunque prima card', () => {
        // wantKey esiste ma non e' in questa lista: findIndex -> -1. E' il caso
        // dell'utente che apre un film nuovo dopo averne guardato un altro.
        expect(decide({ wantIdx: -1 })).toBe('focus-first');
    });

    it('race fallita DOPO aver gia\' visitato la lista -> prima card (REGRESSIONE #2)', () => {
        // L'utente era gia' entrato nella lista (filtro addon), poi e' tornato su
        // "Auto" e la race e' fallita: le card Auto si smontano, il focus cade sul
        // body. Col vecchio flag "focus iniziale gia' fatto" qui non si focalizzava
        // piu' nulla -> stesso sintomo di prima, da un'altra porta.
        expect(decide({ wantIdx: -1, nothingFocused: true, focusInList: false })).toBe('focus-first');
    });

    it('ritorno dal player -> ri-asserisce la card che stavi guardando', () => {
        expect(decide({ wantIdx: 3 })).toBe('reassert-want');
    });

    it('re-sort che smonta le card: il focus va ri-asserito, non perso', () => {
        // I verdetti salute rimescolano la lista e rimontano le card: React perde
        // il focus (activeElement torna a body).
        expect(decide({ wantIdx: 2, nothingFocused: true, focusInList: false })).toBe('reassert-want');
    });

    it('conferma se il focus e\' gia\' sulla card voluta', () => {
        expect(decide({
            wantIdx: 2, nothingFocused: false, focusInList: true, focusIsWanted: true
        })).toBe('reassert-want');
    });

    it('utente spostato su un\'ALTRA card -> molla la chiave, niente scippi', () => {
        expect(decide({
            wantIdx: 2, nothingFocused: false, focusInList: true, focusIsWanted: false
        })).toBe('drop-want');
    });

    it('utente che naviga la lista -> solo scroll, MAI rifocalizzare', () => {
        expect(decide({ wantIdx: -1, nothingFocused: false, focusInList: true })).toBe('keep-in-view');
    });

    it('focus VIVO fuori dalla lista (sidebar) -> non riprenderselo', () => {
        // Il vincolo opposto, altrettanto reale: l'utente ce l'ha portato lui.
        expect(decide({ wantIdx: -1, nothingFocused: false, focusInList: false })).toBe('none');
    });

    it('...nemmeno per ri-asserire la card voluta (sarebbe uno strappo a ogni re-sort)', () => {
        expect(decide({ wantIdx: 2, nothingFocused: false, focusInList: false })).toBe('none');
    });
});
