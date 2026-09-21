// Il pulsante primario della pagina serie (casaResume.js).
const { resumeAction, resumeHref } = require('../src/common/casaResume');

const NOW = Date.parse('2026-09-21T20:00:00Z');
const ep = (o) => ({ id: 'tt5875444:6:2', season: 6, episode: 2, released: new Date('2026-09-16T08:00:00Z'), upcoming: false, watched: false, progress: 0, ...o });

describe('resumeAction', () => {
    it('a meta\' -> "Riprendi · 12 min rimanenti" con la barra', () => {
        expect(resumeAction(ep({ progress: 74 }), 47, NOW)).toEqual({ kind: 'resume', label: 'Riprendi', sublabel: '12 min rimanenti', progress: 74 });
    });
    it('a meta\' senza durata nota -> il codice episodio, mai minuti inventati', () => {
        expect(resumeAction(ep({ progress: 74 }), null, NOW).sublabel).toBe('S06E02');
    });
    it('da iniziare -> "Guarda S06E02", niente barra', () => {
        expect(resumeAction(ep({}), 47, NOW)).toEqual({ kind: 'watch', label: 'Guarda', sublabel: 'S06E02', progress: null });
    });
    it('gia\' visto (stagione finita) -> "Rivedi"', () => {
        expect(resumeAction(ep({ watched: true }), 47, NOW).kind).toBe('rewatch');
    });
    it('FUTURO -> nessun pulsante: non c\'e\' niente da far partire', () => {
        expect(resumeAction(ep({ released: new Date('2026-09-30T08:00:00Z') }), 47, NOW)).toBe(null);
    });
    it('nessun episodio -> nessun pulsante', () => {
        expect(resumeAction(null, null, NOW)).toBe(null);
    });
});

describe('resumeHref', () => {
    it('player se il core ce l\'ha (riparte dove eri)', () => {
        expect(resumeHref(ep({ deepLinks: { player: '#/player/x', metaDetailsStreams: '#/detail/y' } }))).toBe('#/player/x');
    });
    it('altrimenti la scelta del torrent', () => {
        expect(resumeHref(ep({ deepLinks: { player: null, metaDetailsStreams: '#/detail/y' } }))).toBe('#/detail/y');
    });
    it('niente link -> null', () => {
        expect(resumeHref(ep({ deepLinks: null }))).toBe(null);
    });
});
