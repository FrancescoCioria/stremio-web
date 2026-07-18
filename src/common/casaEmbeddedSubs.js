// Casa: logica pura del rimpiazzo "sottotitolo EMBEDDED rotto -> esterno Casa".
//
// CONTESTO. stremio-server non estrae i sub embedded in continuo: li tira fuori
// in un chunk one-shot alla selezione/seek e poi smette -> il fronte cue si
// congela e lo schermo resta muto a meta' episodio. Il fix (v4.30) estrae
// l'INTERA traccia in un VTT completo lato backend e la aggiunge come
// sottotitolo ESTERNO `CASA_EMB_<n>`, dove <n> e' lo STESSO indice della
// `EMBEDDED_<n>` che rimpiazza (stesso subtitle stream del file).
//
// ⚠️ PERCHE' QUESTO MODULO ESISTE (incidente 2026-07-18, "due spicci" E02/E03).
// La v4.31 aggiungeva le tracce Casa e faceva UNO switch programmatico dall'hook.
// Non bastava, e il log lo prova: il fix agganciava e veniva sganciato 4 secondi
// dopo, col playhead ancora a 1.8s:
//
//     19:01:35  sel={embedded:null, extra:"CASA_EMB_0"}   <- switch Casa
//     19:01:39  sel={embedded:"EMBEDDED_0", extra:null}   <- auto-select riprende
//
// Causa: la preferenza SALVATA dello stream e' un id `EMBEDDED_<n>`, e
// l'auto-select di `useSubtitles` risolve gli id salvati per MATCH ESATTO —
// cerca `EMBEDDED_0` fra gli esterni, non lo trova mai (i nostri si chiamano
// `CASA_EMB_0`), quindi ricade sul ramo embedded, riapplica la traccia rotta e
// per giunta CHIUDE il latch (`savedTrack.embedded === true`) -> definitivo.
// Qualunque switch fatto da un altro hook e' destinato a perdere: gira prima, e
// l'auto-select ha l'ultima parola. Per questo il fix vive QUI, nella stessa
// risoluzione che prima ci scavalcava: cosi' non resta nessuno con cui litigare.

const CASA_PREFIX = 'CASA_EMB_';
const EMBEDDED_RE = /^EMBEDDED_(\d+)$/;
const CASA_RE = /^CASA_EMB_(\d+)$/;

// 'EMBEDDED_2' -> 'CASA_EMB_2'. null se non e' un id embedded.
const casaIdForEmbedded = (embeddedId) => {
    const m = EMBEDDED_RE.exec(String(embeddedId ?? ''));
    return m ? CASA_PREFIX + m[1] : null;
};

const isCasaEmbeddedId = (id) => CASA_RE.test(String(id ?? ''));

// NB: le EMBEDDED_<n> rimpiazzate restano visibili nel menu (doppione
// "Italian (SDH)" x2). E' voluto, per ora: sopprimerle e' un cambio UX a se'
// stante e con un rischio suo — se l'estrazione backend fallisse, l'utente
// resterebbe senza NESSUN sottotitolo invece che con uno che regge 5 minuti.
// Si fa dopo, quando l'alias qui sotto avra' un po' di campo alle spalle: una
// variabile per volta. Vedi TODO.md.

// Risolve la preferenza SALVATA verso gli esterni. Oltre al match esatto
// (comportamento upstream), un id embedded salvato risolve alla sua controparte
// Casa quando c'e': e' lo STESSO sottotitolo, stessa lingua, solo consegnato in
// un file completo invece che a chunk in-band -> upgrade trasparente, non un
// cambio di scelta dell'utente.
//
// ⚠️ L'INDICE <n> ARRIVA DA DUE NAMESPACE DIVERSI — per questo si verifica anche
// la lingua. `CASA_EMB_<n>`: n = indice fra gli stream SOTTOTITOLO del container
// (`0:s:<n>` per ffmpeg, dal probe). `EMBEDDED_<n>`: n = indice dentro
// `videoElement.textTracks`, cioe' fra le rendition che hls.js ha agganciato dal
// manifest. Coincidono solo se server.js emette una rendition per ogni stream sub
// nello stesso ordine. Un sottotitolo BITMAP (PGS/DVB) e' un caso reale di
// divergenza: entra nell'enumerazione del probe (non filtriamo per codec) ma non
// puo' diventare WebVTT e server.js puo' ometterlo dal manifest -> gli indici
// slittano di uno e senza controllo consegneremmo la LINGUA SBAGLIATA, in
// silenzio. `expectedLang` (la lingua salvata insieme all'id) fa da sanity check:
// se le due lingue sono note e discordano, l'alias si rifiuta e si ricade
// sull'embedded, che e' degradato ma corretto.
const resolveSavedExtraTrack = (savedTrackId, extraTracks, expectedLang, toCode) => {
    const tracks = Array.isArray(extraTracks) ? extraTracks : [];
    if (!savedTrackId) {
        return undefined;
    }

    const exact = tracks.find((t) => t && t.id === savedTrackId);
    if (exact) {
        return exact;
    }

    const casaId = casaIdForEmbedded(savedTrackId);
    if (!casaId) {
        return undefined;
    }

    const candidate = tracks.find((t) => t && t.id === casaId);
    if (!candidate || !expectedLang || !candidate.lang) {
        return candidate;   // niente con cui confrontare -> si fida dell'indice
    }

    const norm = typeof toCode === 'function' ? toCode : (x) => x;
    return norm(candidate.lang) === norm(expectedLang) ? candidate : undefined;
};

// ─────────────────────────────────────────────────────────────────────────────
// Guardia anti-stale sul cambio episodio.
//
// Al binge N->N+1 il core espone per ~1s uno stato incoerente: `selected` e' gia'
// l'episodio nuovo mentre `stream.url` e' ancora quello VECCHIO. Misurato il
// 2026-07-18 alle 21:24:45, allo stesso secondo:
//
//     ts           ... se=S1E3   <- il video: episodio giusto
//     embedded-subs ... -1x2-    <- i sottotitoli: episodio PRECEDENTE
//
// Estrarre su quell'url significa produrre (e mettere in cache) i sub
// dell'episodio sbagliato, e armare i ref dell'hook su una url che non verra'
// mai riprodotta -> il lavoro giusto non parte piu'. Qui confrontiamo
// l'episodio codificato nell'url (`?se=<stagione>.<episodio>`) con quello
// selezionato (`tt<id>:<stagione>:<episodio>`) e aspettiamo che concordino.
const episodeFromStreamUrl = (streamUrl) => {
    const m = /[?&]se=(\d+)\.(\d+)/.exec(String(streamUrl ?? ''));
    return m ? { season: Number(m[1]), episode: Number(m[2]) } : null;
};

const episodeFromVideoId = (videoId) => {
    const parts = String(videoId ?? '').split(':');
    if (parts.length < 3) {
        return null;
    }

    const season = Number(parts[parts.length - 2]);
    const episode = Number(parts[parts.length - 1]);
    return Number.isFinite(season) && Number.isFinite(episode) ? { season, episode } : null;
};

// true = l'url e' coerente col video selezionato (o non c'e' nulla da
// confrontare: film, o id non ancora noto -> non blocchiamo).
const streamUrlMatchesVideo = (streamUrl, videoId) => {
    const fromUrl = episodeFromStreamUrl(streamUrl);
    const fromId = episodeFromVideoId(videoId);
    if (fromUrl === null || fromId === null) {
        return true;
    }

    return fromUrl.season === fromId.season && fromUrl.episode === fromId.episode;
};

module.exports = {
    casaIdForEmbedded,
    isCasaEmbeddedId,
    resolveSavedExtraTrack,
    episodeFromStreamUrl,
    episodeFromVideoId,
    streamUrlMatchesVideo,
};
