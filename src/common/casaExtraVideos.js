// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: righe episodio per gli episodi che ESISTONO ma che Cinemeta non elenca.
//
// Il caso che l'ha prodotto (X Factor, 2026-09-18): la puntata del 17 settembre
// era su TMDB e i suoi torrent erano su Torrentio, ma la scheda della serie in
// libreria (`tt1194223`, fonte TVDB) si ferma all'episodio 1 -> nella lista
// episodi non c'era NIENTE da cliccare. Non e' "nessuna sorgente": e' l'episodio
// che non compare, e nessun torrent aggiunto a mano puo' ripararlo.
//
// Il backend dice quali mancano (`/stremio-addon/extra-videos`, solo episodi
// gia' andati in onda); qui si costruisce la riga e si fonde nella lista.
//
// ⚠️ Il DEDUP si fa QUI, contro il meta vero che la tile ha in mano: la lista
// del backend viene da una cache di 12h, quindi nel giorno in cui Cinemeta si
// aggiorna direbbe ancora "manca" e si vedrebbe la riga DOPPIA — proprio mentre
// il problema si sta risolvendo da solo. Appena il core elenca l'episodio, il
// nostro sparisce e vince il suo (che ha progresso, visto, deepLinks veri).
//
// ⚠️ `released` dev'essere un oggetto Date: `Video.js` fa `released instanceof
// Date` e senza mostrerebbe la riga senza data, in silenzio.

// ⚠️ Senza thumbnail `Video.js` NON disegna il riquadro immagine: la card
// diventa un'etichetta nuda accanto a quelle con la foto, e sembra rotta
// (visto nello screenshot, non nel DOM). TMDB lo still di un episodio appena
// uscito spesso non ce l'ha, quindi si ripiega sullo sfondo della SERIE: e'
// arte del programma, non dell'episodio, ma la card ha la forma giusta.
//
// Riga episodio sintetica, nella forma che il core produce per i suoi video.
// `watched`/`progress` partono da zero: il core li calcola dalla library per i
// PROPRI video e non sa niente di questo. Il visto delle righe extra lo decide
// `extraWatchedState` (sotto), dal flag del backend e dalla library.
// `casaMetaId` serve a chi deve SCRIVERE il visto senza avere il meta in mano
// (Stream.js, player esterno).
const buildCasaVideo = (metaId, v, fallbackThumbnail) => {
    const released = typeof v.released === 'string' && v.released ? new Date(v.released) : null;
    return {
        id: v.id,
        title: v.title,
        overview: null,
        released: released && !isNaN(released.getTime()) ? released : null,
        thumbnail: v.thumbnail || fallbackThumbnail || null,
        season: v.season,
        episode: v.episode,
        streams: [],
        trailerStreams: [],
        watched: false,
        progress: 0,
        upcoming: false,
        scheduled: false,
        // Stessa forma dei deepLinks del core: `#/detail/{type}/{metaId}/{videoId}`.
        // Verificato che la pagina stream funziona anche per un videoId che il
        // meta non contiene (e' il caso per cui esiste tutto questo).
        deepLinks: {
            metaDetailsStreams: '#/detail/series/' + encodeURIComponent(metaId) + '/' + encodeURIComponent(v.id),
            player: null,
            externalPlayer: null,
        },
        casaExtra: true,
        casaMetaId: metaId,
    };
};

// ⚠️ Il visto della riga extra NON puo' scriverlo il core: il suo bitfield
// `watched` e' indicizzato sugli episodi che Cinemeta elenca, e per uno che non
// elenca non ha una casella (`WatchedBitField::set_video` lo salta in silenzio:
// "Segna come visto" non faceva niente). Caso reale (X Factor S20E02,
// 2026-09-21): guardata la sera prima per 122 minuti su 144, e la pagina la
// dava NON vista — con Riprendi e il focus d'ingresso proponeva "Guarda
// S20E02", un episodio gia' visto.
//
// Due fonti, fuse in UNA decisione (`extraWatchedState`):
// 1. il flag del backend (`/stremio-addon/extra-watched`, tabella nostra):
//    "segna come visto", "segna stagione", e cio' che la 2 ha gia' fissato;
// 2. la ricostruzione dalla library, qui sotto. L'unica traccia e' sull'item:
//    `video_id` = l'ULTIMO episodio aperto, quindi vale solo per QUELLO —
//    per questo, appena dice "finito", la tile lo fissa nel backend
//    (source 'auto'): se no si perdeva al primo episodio aperto dopo (E02 ed
//    E03 di X Factor, guardati, risultavano non visti). Segnali, tutti del
//    core e verificati:
// - timeOffset > 0 -> lasciato a meta': progresso = offset/durata;
// - timeOffset === 0 dopo averlo riprodotto (timeWatched > 0) -> il player ha
//   superato il 90% (CREDITS_THRESHOLD_COEF di stremio-core, models/player.rs:
//   oltre quella soglia azzera l'offset all'uscita) -> visto.
// Nessuna soglia nostra: niente numeri da tarare.
const libraryProgress = (state, id) => {
    if (!state || state.video_id !== id) return null;
    const offset = Number(state.timeOffset) || 0;
    const duration = Number(state.duration) || 0;
    if (offset > 0) {
        return duration > 0 ? { watched: false, progress: Math.min(100, (offset / duration) * 100) } : null;
    }
    return (Number(state.timeWatched) || 0) > 0 ? { watched: true, progress: 0 } : null;
};

// LA decisione del visto di una riga extra. Puro.
// `flag` = {watched, ts, source} dal backend (o null), `libraryState` come sopra.
// Regola: vince l'evento PIU' RECENTE.
// - flag visto -> visto (come il bitfield del core: riaprire l'episodio non lo
//   toglie);
// - flag NON visto (l'utente l'ha tolto) -> resta non visto, a meno che la
//   library dica che e' stato riguardato fino in fondo DOPO (`lastWatched` >
//   ts del flag). Senza questo confronto "togli il visto" sull'ultimo aperto
//   non avrebbe effetto: la ricostruzione lo rimetterebbe subito;
// - nessun flag -> la ricostruzione.
// `from` dice chi ha deciso il visto: 'library' = il backend non lo sa ancora
// (e' cio' che la tile deve fissare, vedi autoWatchedIds).
const extraWatchedState = (id, flag, libraryState) => {
    const lib = libraryProgress(libraryState, id);
    const progress = lib ? lib.progress : 0;
    if (flag && flag.watched === true) return { watched: true, progress, from: 'flag' };
    if (lib && lib.watched) {
        const last = Date.parse(libraryState && libraryState.lastWatched);
        if (!flag || (Number.isFinite(last) && last > (Number(flag.ts) || 0))) {
            return { watched: true, progress, from: 'library' };
        }
    }
    return { watched: false, progress, from: flag ? 'flag' : null };
};

// Fonde le righe mancanti in quelle del core. Puro: niente rete, niente React.
// `libraryState` = libraryItem.state (o null): vedi libraryProgress.
// `flags` = {videoId: {watched, ts, source}} dal backend (o null).
const mergeCasaExtraVideos = (videos, extra, metaId, fallbackThumbnail, libraryState = null, flags = null) => {
    if (!Array.isArray(extra) || extra.length === 0 || !metaId) return videos;
    const have = new Set((videos || []).map((v) => v && v.id));
    const add = extra
        .filter((v) => v && typeof v.id === 'string' && !have.has(v.id))
        .map((v) => {
            const row = buildCasaVideo(metaId, v, fallbackThumbnail);
            const st = extraWatchedState(row.id, flags ? flags[row.id] : null, libraryState);
            return { ...row, watched: st.watched, progress: st.progress, casaWatchedFrom: st.from };
        });
    return add.length > 0 ? (videos || []).concat(add) : videos;
};

// Righe extra viste per la library ma che il backend non sa ancora: vanno
// fissate (source 'auto') prima che l'ultimo aperto cambi e la ricostruzione
// non le veda piu'.
const autoWatchedIds = (videos) => (videos || [])
    .filter((v) => v && v.casaExtra && v.watched && v.casaWatchedFrom === 'library')
    .map((v) => v.id);

// Cinemeta ha aggiunto l'episodio: la riga extra sparisce e vince il video del
// core — col SUO bitfield, che del visto dato da noi non sa niente. Puro.
// Per ogni flag visto non ancora migrato il cui video ORA e' nel meta:
// - core dice non visto -> `dispatch` (MarkVideoAsWatched, una volta);
// - core dice gia' visto -> `confirm` (si segna 'migrated' nel backend, cosi'
//   non si rifa': se poi l'utente toglie il visto dal core, resta tolto).
const migrationPlan = (coreVideos, flags) => {
    const out = { dispatch: [], confirm: [] };
    if (!flags || !Array.isArray(coreVideos)) return out;
    for (const v of coreVideos) {
        const f = v && flags[v.id];
        if (!f || f.watched !== true || f.source === 'migrated') continue;
        if (v.watched) out.confirm.push(v.id);
        else out.dispatch.push(v);
    }
    return out;
};

// Chi scrive "segna la stagione": il core per i suoi episodi, il backend per
// le righe extra. Puro.
const seasonWriteSplit = (videos, season) => {
    const inSeason = (videos || []).filter((v) => v && v.season === season);
    return {
        core: inSeason.some((v) => !v.casaExtra),
        extraIds: inSeason.filter((v) => v.casaExtra).map((v) => v.id),
    };
};

module.exports = { buildCasaVideo, mergeCasaExtraVideos, libraryProgress, extraWatchedState, autoWatchedIds, migrationPlan, seasonWriteSplit };
