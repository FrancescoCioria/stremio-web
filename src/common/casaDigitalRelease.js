// Copyright (C) 2017-2026 Smart code 203358507

// Etichetta "Disponibile dal <data>" per il dettaglio FILM (Casa). E' la data
// di uscita DIGITALE (WEB-DL): segnala quando compaiono i primi rip di buona
// qualita'. Un film ancora solo al cinema ha solo cam/telesync, uscito in
// digitale ha rip affidabili. "Disponibile dal" perche' "Digitale" da solo non
// diceva niente all'utente (2026-07-17).
//
// Scelta utente: mostrare la data SOLO per film recenti o imminenti — i casi in
// cui decide la qualita' dei torrent. Sui film vecchi (rip ovvi) niente rumore.
//
// digitalIso   = ISO date della prima uscita digitale nota (min fra i paesi),
//                passata o futura; null se TMDB non ne ha.
// movieReleased = data di uscita del film (Date|ISO|null): serve a stabilire la
//                recenza quando la data digitale NON e' nota ("non ancora
//                annunciata" ha senso solo su un film nuovo, non su uno del '97).
// now          = timestamp ms (iniettabile nei test).
//
// Ritorna la stringa da mostrare, oppure null (niente riga).

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_MS = 365 * DAY_MS; // "recente" = entro ~1 anno
const COUNTDOWN_MAX_DAYS = 45; // "(fra Ng)" solo se l'uscita e' vicina

const fmtDate = (t) =>
    new Date(t).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const toMs = (v) => {
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'string' && v.length > 0) return Date.parse(v);
    return NaN;
};

const digitalReleaseLabel = (digitalIso, movieReleased, now = Date.now()) => {
    const dig = toMs(digitalIso);
    if (Number.isFinite(dig)) {
        const daysAhead = (dig - now) / DAY_MS;
        if (daysAhead > 0.5) {
            // Uscita futura: sempre rilevante (torrent = cam finche' non esce).
            const inDays = Math.ceil(daysAhead);
            const countdown = inDays <= COUNTDOWN_MAX_DAYS ? ` (fra ${inDays}g)` : '';
            return `Disponibile dal ${fmtDate(dig)}${countdown}`;
        }
        // Uscita passata: mostra solo se recente, altrimenti e' rumore.
        if (now - dig <= RECENT_WINDOW_MS) return `Disponibile dal ${fmtDate(dig)}`;
        return null;
    }
    // Nessuna data digitale nota: ha senso segnalarlo SOLO su un film recente o
    // imminente (in sala ora / uscito da poco), non su un catalogo vecchio.
    const rel = toMs(movieReleased);
    if (Number.isFinite(rel) && (rel > now || now - rel <= RECENT_WINDOW_MS)) {
        return 'Disponibile: data non nota';
    }
    return null;
};

module.exports = { digitalReleaseLabel };
