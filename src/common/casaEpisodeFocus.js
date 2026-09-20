// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: SU QUALE stagione si apre la pagina di una serie, e QUALE episodio
// prende il focus. Decisione pura, testabile (tests/casaEpisodeFocus.spec.js).
//
// Il caso che l'ha prodotto (Slow Horses, 2026-09-20): la pagina si apriva su
// S5 — sei episodi su sei gia' visti — mentre S6E1 era uscito il 16/09. La
// regola di upstream punta alla stagione di `libraryItem.state.video_id`, cioe'
// all'ULTIMO EPISODIO APERTO: risponde a "dove sono rimasto", mentre chi accende
// la TV chiede "cosa guardo adesso". E' la stessa classe del salto della sigla
// in Continue Watching ([[project_stremio_cw_credits_skip]]): finito l'ultimo
// episodio di una stagione, il punto di ripresa e' un vicolo cieco.
//
// A/B sulla library VERA, 2026-09-20 (271 item, 80 serie, 71 con progresso),
// regola vecchia contro nuova sullo stesso corpus: 67 NON si muovono, 4 si'.
// Tre sono il difetto — The Bear (S4 finita, esiste S5), Slow Horses (S5
// finita, S6E1 uscito il 16/09), Star Wars: Visions (S2 finita, esiste S3).
// La quarta e' X Factor: l'episodio di ripresa (S20E02) non e' nel meta di
// Cinemeta, e upstream, non trovandolo, ripiegava sulla PRIMA stagione — la
// 1, del 2007. In produzione la lista e' quella FUSA con le righe nostre
// (casaExtraVideos), che quell'episodio ce l'ha, quindi li' non si vedeva:
// il ripiego sull'id resta come rete, non come fix.
//
// ⚠️ Il fallimento e' verso lo STATUS QUO: se il bitfield `watched` del core e'
// parziale (un episodio visto ma non marcato), "stagione conclusa" e' falso e
// si resta dove si era. Meglio riaprire il difetto noto che mandare l'utente
// su una stagione che non ha ancora visto.

// ⚠️ Due domande diverse, e l'episodio SENZA DATA risponde no a entrambe in
// direzioni opposte. Cinemeta annuncia stagioni con un episodio segnaposto e
// `released: null` (Foundation S4 al 20/09/2026: 1 episodio listato, nessuna
// data): trattarlo come "uscito" faceva scavalcare S3 e atterrare su una
// stagione vuota — corretto per il codice, inaccettabile davanti alla TV.
// Preso dall'A/B sulla library vera, non dai test.
//
// `isKnownFuture`: sappiamo per certo che non e' ancora uscito.
const isKnownFuture = (video, now) => {
    if (!video) return false;
    if (video.upcoming) return true;
    const t = video.released instanceof Date ? video.released.getTime() : NaN;
    return Number.isFinite(t) && t > now;
};

// `hasAired`: PROVA che e' uscito (data vera nel passato). Serve a TIRARE il
// focus dentro una stagione: senza prova non ci si sposta.
const hasAired = (video, now) => {
    if (!video || video.upcoming) return false;
    const t = video.released instanceof Date ? video.released.getTime() : NaN;
    return Number.isFinite(t) && t <= now;
};

const seasonOfVideoId = (videos, videoId) => {
    if (typeof videoId !== 'string' || !videoId) return null;
    const video = (videos || []).find((v) => v && v.id === videoId);
    if (video && typeof video.season === 'number') return video.season;
    // Il meta puo' non elencare piu' quell'episodio (Cinemeta cambia scheda):
    // l'id "tt123:S:E" porta comunque la stagione.
    const m = /:(\d+):(\d+)$/.exec(videoId);
    return m ? Number(m[1]) : null;
};

const inSeason = (videos, season) => (videos || []).filter((v) => v && v.season === season);

// "Non c'e' piu' niente da vedere qui": ogni episodio non-futuro della stagione
// e' visto. Qui un episodio senza data CONTA (e quindi, se non visto, BLOCCA il
// salto): la direzione prudente e' restare dove si era.
const seasonExhausted = (videos, season, now) => {
    const usciti = inSeason(videos, season).filter((v) => !isKnownFuture(v, now));
    return usciti.length > 0 && usciti.every((v) => v.watched === true);
};

// La prima stagione DOPO `season` con un episodio uscito e non visto. Non
// "quella successiva": se anche quella fosse conclusa si andrebbe oltre.
// Gli speciali (stagione 0) non rubano mai il focus.
const nextSeasonWithSomethingToWatch = (videos, seasons, season, now) => {
    const later = (seasons || [])
        .filter((s) => typeof s === 'number' && s > season && s !== 0)
        .sort((a, b) => a - b);
    for (const s of later) {
        if (inSeason(videos, s).some((v) => hasAired(v, now) && v.watched !== true)) return s;
    }
    return null;
};

// Ritorna { season, reason }. `reason` esiste per poterlo vedere da fuori:
// il salto e' raro e senza un evento non si saprebbe mai se ha ingaggiato.
const pickSeason = ({ seasons, seasonFromUrl, videos, resumeVideoId, now = Date.now() }) => {
    const list = seasons || [];
    // Scelta esplicita dell'utente (pill o URL): non si tocca, mai.
    if (list.includes(seasonFromUrl)) return { season: seasonFromUrl, reason: 'url' };

    // ⚠️ `resume === 0` (uno SPECIALE come ultimo episodio aperto) non apre la
    // pagina sugli Speciali: upstream lo escludeva con un `video.season &&`
    // truthy, e passando a `typeof === 'number'` lo zero sarebbe rientrato di
    // soppiatto — un dietro-le-quinte visto una volta diventava la stagione con
    // cui si apre la serie. Stessa invariante di nextSeasonWithSomethingToWatch.
    const resume = seasonOfVideoId(videos, resumeVideoId);
    if (resume !== null && resume !== 0 && list.includes(resume)) {
        if (seasonExhausted(videos, resume, now)) {
            const next = nextSeasonWithSomethingToWatch(videos, list, resume, now);
            // Niente oltre: si resta sulla stagione di ripresa (com'era).
            if (next !== null) return { season: next, reason: 'resume-season-finished' };
        }
        return { season: resume, reason: 'resume' };
    }

    const nonSpecial = list.filter((s) => s !== 0);
    if (nonSpecial.length > 0) return { season: nonSpecial[0], reason: 'first' };
    if (list.length > 0) return { season: list[0], reason: 'first-special' };
    return { season: null, reason: 'no-seasons' };
};

// Quale episodio prende il focus dentro la stagione mostrata.
//
// ⚠️ L'ordine e' cambiato il 2026-09-20: "primo non visto" viene PRIMA di
// "ultimo visto". Upstream metteva l'ultimo visto davanti per rispondere a
// "dove sono rimasto", ma quella domanda ha gia' la sua risposta nella regola
// 1 (`selectedVideoId` = l'episodio che l'utente ha davvero aperto). Quando la
// regola 1 non aggancia — cioe' quando la stagione mostrata NON e' quella del
// punto di ripresa — l'utente e' andato altrove apposta, e li' vuole il primo
// da vedere. Sintomo prima del fix: entrando nella stagione nuova il focus
// atterrava sull'ultimo episodio.
const pickFocusVideo = (videosForSeason, selectedVideoId, now = Date.now()) => {
    const list = videosForSeason || [];
    if (list.length === 0) return null;
    return (
        // 1. L'episodio che l'utente ha aperto per ultimo, se e' in questa stagione.
        (selectedVideoId && list.find((v) => v.id === selectedVideoId)) ||
        // 2. Uno lasciato a meta'.
        list.find((v) => typeof v.progress === 'number' && v.progress > 0 && !v.watched) ||
        // 3. Il primo da vedere (un episodio futuro non e' un punto di ripresa).
        list.find((v) => !isKnownFuture(v, now) && v.watched !== true) ||
        // 4. Stagione tutta vista: l'ultimo, cosi' si atterra in fondo e non
        //    si ricomincia dal pilota.
        [...list].reverse().find((v) => v.watched === true) ||
        list[0]
    );
};

// ⚠️ La stagione mostrata e' una decisione D'INGRESSO, presa UNA volta per
// titolo — non una funzione continua degli episodi. `watched` cambia IN
// DIRETTA (menu della card: "Segna come visto" / "Segna il resto come
// visto"): senza questo latch, marcare l'ultimo episodio di una stagione la
// dichiarava conclusa e faceva sparire la lista da sotto le mani dell'utente,
// portandolo alla stagione dopo con tanto di auto-focus. Aveva chiesto di
// marcare un episodio, non di cambiare pagina. Stesso latch copre gli episodi
// extra (casaExtraVideos) che arrivano tardi e farebbero oscillare la scelta a
// pagina gia' interattiva. Trovato in review, 2026-09-20.
//
// `prev` = { metaId, season } tenuto dal chiamante. Ritorna null quando la
// decisione va (ri)presa, altrimenti { next, decision }.
const holdSeason = (prev, { metaId, seasons, seasonFromUrl }) => {
    const list = seasons || [];
    // La scelta esplicita dell'utente (pill/URL) vince e diventa il latch.
    if (list.includes(seasonFromUrl)) {
        return { next: { metaId, season: seasonFromUrl }, decision: { season: seasonFromUrl, reason: 'url' } };
    }
    // Titolo diverso: si ricomincia.
    if (!prev || prev.metaId !== metaId) return null;
    // La stagione scelta all'ingresso puo' sparire (il meta cambia sotto):
    // in quel caso si ridecide invece di mostrare una stagione che non c'e'.
    if (prev.season === null || prev.season === undefined || !list.includes(prev.season)) return null;
    return { next: prev, decision: { season: prev.season, reason: 'latched' } };
};

module.exports = { pickSeason, pickFocusVideo, holdSeason, seasonExhausted, nextSeasonWithSomethingToWatch, isKnownFuture, hasAired };
