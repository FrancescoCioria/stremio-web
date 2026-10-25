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
const { validDate } = require('./casaEpisodeCard');

// "2026-10-09" (data TMDB del backend) -> Date valida, o null.
const toDate = (s) => {
    const d = typeof s === 'string' && s ? new Date(s) : null;
    return validDate(d) ? d : null;
};

// Minuti reali (TMDB) o null: 0 e null di TMDB = non noto, mai "0 min".
const minutes = (x) => (typeof x === 'number' && x > 0 ? x : null);

const buildCasaVideo = (metaId, v, fallbackThumbnail) => {
    return {
        id: v.id,
        title: v.title,
        overview: null,
        released: toDate(v.released),
        thumbnail: v.thumbnail || fallbackThumbnail || null,
        casaRuntime: minutes(v.runtime),
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

// Episodi che Cinemeta ELENCA ma con la scheda GREZZA (da IMDb, non da TVDB):
// senza `episode` il core non riconosce stagione ne' episodio -> "Sundefined ·
// Eundefined", "Episode #1.1", card nere, una riga senza stagione. Caso reale
// 2026-10-25: "Nord Sud Ovest Est: La leggendaria storia degli 883"
// (`tt42026819`). Misurato quel giorno: 0 su 50 serie passate dalla home.
//
// Si RIPARA il video del core, non lo si sostituisce: deepLinks, bitfield del
// visto ed "episodio successivo" del core funzionano per id, quindi restano
// suoi. Stagione/episodio dall'id (`tt…:S:E`, la forma che il core stesso
// usa), titolo/data/foto dai dati TMDB del backend (`repairs` di
// `/stremio-addon/extra-videos`). Backend giu' = si ripara solo dall'id.
// ⚠️ Solo i video SENZA stagione/episodio: una scheda normale esce identica
// (stesso array), qualunque cosa dica il backend.
// Ripara la lista della pagina serie e del menu episodi del player
// (useCasaSeriesVideos); la card in Continua a guardare prende solo le DATE
// (casaMetaCache.withRepairDates). Limite noto: "episodio successivo" del core
// nel player va per posizione e, senza date, propone anche un episodio futuro.
// ⚠️ `released` dalla useMetaDetails arriva come Date anche quando manca
// (`new Date(NaN)`): "c'e'" = Date valida.
const isRaw = (v) => !!v && typeof v.id === 'string' && (typeof v.season !== 'number' || typeof v.episode !== 'number');

const repairCoreVideos = (videos, repairs, metaId) => {
    if (!Array.isArray(videos) || !metaId || !videos.some(isRaw)) return videos;
    const byId = new Map((repairs || []).filter((r) => r && typeof r.id === 'string').map((r) => [r.id, r]));
    let changed = false;
    const out = videos.map((v) => {
        if (!isRaw(v)) return v;
        const m = /^(.+):(\d+):(\d+)$/.exec(v.id);
        if (!m || m[1] !== metaId) return v;
        changed = true;
        const r = byId.get(v.id) || {};
        return {
            ...v,
            season: parseInt(m[2], 10),
            episode: parseInt(m[3], 10),
            title: r.title || v.title,
            released: validDate(v.released) ? v.released : (toDate(r.released) || v.released),
            thumbnail: v.thumbnail || r.thumbnail || null,
            casaRepaired: true,
        };
    });
    return changed ? out : videos;
};

// DATI TMDB PER EPISODIO (25/10/2026): titolo e trama in italiano al posto
// dell'inglese di Cinemeta (scelta utente) e DURATA REALE (`casaRuntime`, prima
// /episode-runtimes per stagione). L'abbinamento e la guardia sulle date
// (numerazione TMDB diversa = stagione scartata) li fa il backend (`episodes`,
// extra_videos.ts pickEpisodeData); qui si applicano. Campo assente (titolo
// generico "Episodio N", trama vuota) = resta quello di Cinemeta.
// Nessun dato = STESSO array.
const applyEpisodeData = (videos, episodes) => {
    if (!Array.isArray(videos) || !Array.isArray(episodes) || episodes.length === 0) return videos;
    const byId = new Map(episodes.filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t]));
    let changed = false;
    const out = videos.map((v) => {
        const t = v && byId.get(v.id);
        if (!t) return v;
        changed = true;
        return {
            ...v,
            title: t.title || v.title,
            overview: t.overview || v.overview,
            casaRuntime: minutes(t.runtime),
        };
    });
    return changed ? out : videos;
};

// Durata reale di un episodio della lista unita, o null (mai la nominale della
// serie: il `runtime` del meta e' uguale per tutti e spesso lontano dal vero).
// Speciali (stagione 0) mai: il backend non li abbina (numerazioni diverse).
const runtimeOf = (video) => (video ? minutes(video.casaRuntime) : null);

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
// ⚠️ Episodi RIPARATI (repairCoreVideos): sono del core, ma `MarkSeasonAsWatched`
// sceglie gli episodi dalla SUA `series_info`, che su una scheda grezza non
// c'e' -> non segnerebbe niente, in silenzio. Per quelli uno per uno
// (`coreVideos`, MarkVideoAsWatched: il bitfield e' per id e funziona).
const seasonWriteSplit = (videos, season) => {
    const inSeason = (videos || []).filter((v) => v && v.season === season);
    return {
        core: inSeason.some((v) => !v.casaExtra && !v.casaRepaired),
        coreVideos: inSeason.filter((v) => !v.casaExtra && v.casaRepaired),
        extraIds: inSeason.filter((v) => v.casaExtra).map((v) => v.id),
    };
};

module.exports = { buildCasaVideo, mergeCasaExtraVideos, repairCoreVideos, applyEpisodeData, runtimeOf, libraryProgress, extraWatchedState, autoWatchedIds, migrationPlan, seasonWriteSplit };
