// Copyright (C) 2017-2026 Smart code 203358507

// Lista episodi di Cinemeta (+ quelli che Cinemeta non elenca ancora) per i
// titoli di coda.
//
// ⚠️ Fino alla v4.162 qui viveva anche la cache dei metadati dell'hero della
// home (Cinemeta chiesto dalla tile al focus, cache in localStorage da 400
// voci). Ora li da' il backend in blocco (`casaHero.js`, `hero.ts`): la home ha
// piu' di 400 titoli e quella cache si svuotava da sola. La chiave vecchia si
// toglie una volta, per non lasciare ~200 KB morti nella quota condivisa col
// core.
try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem('casa-cache:cinemeta');
} catch (_e) { /* storage non disponibile: niente da togliere */ }

const { casaBackendUrl } = require('./casaBackend');

const CINEMETA = 'https://v3-cinemeta.strem.io/meta/';

// `tt12345:1:1` (episodio) -> `tt12345`: Cinemeta vuole il titolo padre.
const baseIdOf = (id) => {
    const m = id ? String(id).match(/^(tt\d+|kitsu:\d+)/) : null;
    return m ? m[1] : null;
};

// Lista episodi di una serie, per sapere qual e' il successivo (casaCreditsSkip).
// ⚠️ NIENTE cache persistente, apposta: e' la parte pesante del meta
// (centinaia di episodi per una serie lunga). Si chiede solo al click su una
// card nei titoli di coda, cioe' raramente.
// Tempo massimo di attesa dal click: oltre, si apre la card come sempre invece
// di lasciare il divano davanti a un click che non fa niente.
const VIDEOS_TIMEOUT_MS = 3000;
const fetchJson = (url) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), VIDEOS_TIMEOUT_MS);
    return fetch(url, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .finally(() => clearTimeout(timer));
};

// Lista Cinemeta + episodi che Cinemeta non elenca ancora (backend, gli stessi
// della lista episodi: casaExtraVideos.js).
// ⚠️ Senza le extra la card nei titoli di coda non trovava il successivo: X Factor
// 03/10/2026, card su E03 al 96,6% con E04 uscito -> `no-next-video` (Cinemeta
// elencava solo E01).
// ⚠️ L'ordine di Cinemeta NON si tocca: il successivo e' "il video dopo nella
// lista" (MetaItem::next_video) e Cinemeta non e' sempre ordinata (Breaking Bad
// S1E7 prima di S1E6, speciali in mezzo alle stagioni). Ogni extra entra subito
// dopo l'ultimo video della SUA stagione con episodio minore; se non ce n'e', in coda.
// Puro: nessuna extra -> la lista di Cinemeta tale e quale.
const withExtraVideos = (videos, extra) => {
    if (!Array.isArray(videos) || !Array.isArray(extra) || extra.length === 0) return videos;
    const have = new Set(videos.map((v) => v && v.id));
    const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
    const add = extra
        .filter((v) => v && typeof v.id === 'string' && !have.has(v.id))
        .sort((a, b) => num(a.season) - num(b.season) || num(a.episode) - num(b.episode));
    if (add.length === 0) return videos;
    const out = videos.slice();
    for (const v of add) {
        let at = -1;
        out.forEach((x, i) => {
            if (x && num(x.season) === num(v.season) && num(x.episode) < num(v.episode)) at = i;
        });
        if (at < 0) out.push(v);
        else out.splice(at + 1, 0, v);
    }
    return out;
};

// Scheda Cinemeta GREZZA (casaExtraVideos.js, repairCoreVideos): episodi senza
// `released` = "gia' uscito" per nextVideoAfter (come per il core). Caso: 883
// (tt42026819), card su E04 nei titoli di coda -> E05, in onda il 30/10 ->
// pagina torrent vuota. Si mette la data TMDB dei `repairs` del backend dove
// manca. Puro; senza repairs = lista tale e quale.
// Limite: "2026-10-30" = mezzanotte UTC, quindi il giorno della messa in onda
// l'episodio conta come uscito dall'01:00 (come le righe extra).
const withRepairDates = (videos, repairs) => {
    if (!Array.isArray(videos) || !Array.isArray(repairs) || repairs.length === 0) return videos;
    const byId = new Map(repairs.filter((r) => r && typeof r.id === 'string' && r.released).map((r) => [r.id, r.released]));
    let changed = false;
    const out = videos.map((v) => {
        if (!v || v.released || !byId.has(v.id)) return v;
        changed = true;
        return { ...v, released: byId.get(v.id) };
    });
    return changed ? out : videos;
};

const fetchSeriesVideos = (type, id) => {
    const baseId = baseIdOf(id);
    if (!type || !baseId) return Promise.resolve(null);
    const backend = type === 'series' ? casaBackendUrl('/stremio-addon/extra-videos/series/' + encodeURIComponent(baseId)) : null;
    return Promise.all([
        fetchJson(`${CINEMETA}${encodeURIComponent(type)}/${encodeURIComponent(baseId)}.json`),
        backend ? fetchJson(backend) : Promise.resolve(null),
    ]).then(([data, extra]) => {
        const videos = data && data.meta && Array.isArray(data.meta.videos) ? data.meta.videos : null;
        const dated = withRepairDates(videos, extra && Array.isArray(extra.repairs) ? extra.repairs : null);
        return withExtraVideos(dated, extra && Array.isArray(extra.videos) ? extra.videos : null);
    });
};

module.exports = { baseIdOf, fetchSeriesVideos, withExtraVideos, withRepairDates };
