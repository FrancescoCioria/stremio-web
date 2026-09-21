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
// `watched`/`progress` restano a zero: il core li calcola dalla library per i
// PROPRI video e non sa niente di questo: finche' Cinemeta non lo elenca la
// card resta "non vista" anche dopo averla guardata. Difetto noto e accettato
// — dura quanto il ritardo di TVDB, e l'alternativa (scrivere noi nella
// library un video che il core non conosce) e' molto peggio.
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
    };
};

// ⚠️ Il visto della riga extra lo ricostruiamo NOI dalla library, perche' il
// core non puo' scriverlo: il suo bitfield `watched` e' indicizzato sugli
// episodi che Cinemeta elenca, e per uno che non elenca non ha una casella.
// Caso reale (X Factor S20E02, 2026-09-21): guardata la sera prima per 122
// minuti su 144, e la pagina la dava NON vista — con Riprendi e il focus
// d'ingresso proponeva "Guarda S20E02", un episodio gia' visto.
//
// L'unica traccia e' sull'item: `video_id` = l'ULTIMO episodio aperto. Quindi
// si ricostruisce solo QUELLO (gli extra guardati prima restano non visti:
// difetto residuo, scritto). Segnali, tutti del core e verificati:
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

// Fonde le righe mancanti in quelle del core. Puro: niente rete, niente React.
// `libraryState` = libraryItem.state (o null): vedi libraryProgress.
const mergeCasaExtraVideos = (videos, extra, metaId, fallbackThumbnail, libraryState = null) => {
    if (!Array.isArray(extra) || extra.length === 0 || !metaId) return videos;
    const have = new Set((videos || []).map((v) => v && v.id));
    const add = extra
        .filter((v) => v && typeof v.id === 'string' && !have.has(v.id))
        .map((v) => {
            const row = buildCasaVideo(metaId, v, fallbackThumbnail);
            const lib = libraryProgress(libraryState, row.id);
            return lib ? { ...row, ...lib } : row;
        });
    return add.length > 0 ? (videos || []).concat(add) : videos;
};

module.exports = { buildCasaVideo, mergeCasaExtraVideos, libraryProgress };
