// Copyright (C) 2017-2026 Smart code 203358507

const { isStaleSubtitles } = require('../src/routes/Player/casaSubsStale');

describe('isStaleSubtitles', () => {
    const sig = 'https://subs5.strem.io/a|https://subs5.strem.io/b';

    // Il caso per cui la guardia esiste: E08 -> E09, il core espone ancora le
    // tracce di E08 per ~1 s.
    it('cambio episodio con la stessa lista -> stantie', () => {
        expect(isStaleSubtitles({ videoId: 'tt1:1:8', sig }, 'tt1:1:9', sig)).toBe(true);
    });

    // Il caso rotto fino alla v4.162: stesso film ricaricato (watchdog, errore
    // di decodifica, restart del backend) -> le tracce vanno riaggiunte.
    it('stesso video ricaricato con la stessa lista -> NON stantie', () => {
        expect(isStaleSubtitles({ videoId: 'tt0181689', sig }, 'tt0181689', sig)).toBe(false);
    });

    it('lista nuova -> mai stantie', () => {
        expect(isStaleSubtitles({ videoId: 'tt1:1:8', sig }, 'tt1:1:9', 'https://subs5.strem.io/c')).toBe(false);
    });

    it('prima aggiunta -> mai stantie', () => {
        expect(isStaleSubtitles(null, 'tt1', sig)).toBe(false);
    });
});
