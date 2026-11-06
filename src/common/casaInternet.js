// Copyright (C) 2017-2026 Smart code 203358507
//
// "C'e' internet in casa?" dentro la tile. Lo stato NON lo misura la tile: lo
// produce la sonda del launcher-backend (`internet_health.ts`, ogni 15 s, due
// bersagli, accesa dopo due giri falliti) e lo espone `GET /system/internet`
// ({ online, since, reason }). Qui solo come leggerlo e cosa dire.
//
// Perche': quando cade la linea (o si riavvia il router) Stremio si rompe a modo
// suo — addon in errore, cataloghi vuoti, torrent che non partono, "caricamento"
// infinito — e nessuno di quei messaggi dice "e' la rete". Chi e' sul divano
// riprova, riavvia la tile, cambia film, invece di aspettare o riavviare il
// router. Il launcher ha gia' la sua pill, ma dentro la tile non si vede.
//
// ⚠️ Backend che non risponde = stato SCONOSCIUTO, non "offline": la tile non
// puo' sapere se manca internet, e un banner che mente su un backend in riavvio
// (deploy) sarebbe peggio di nessun banner.

const POLL_INTERVAL_MS = 10 * 1000;
const FETCH_TIMEOUT_MS = 3 * 1000;
// Quanto resta il "Internet tornato" dopo un blackout visto dalla tile: il tempo
// di leggerlo e capire che adesso si puo' riprovare.
const BACK_ONLINE_MS = 10 * 1000;
// Letture illeggibili di fila dopo cui il banner si spegne: backend morto a
// linea giu' (poi tornata) lascerebbe il rosso acceso per sempre. 3 x 10 s.
const UNKNOWN_HIDE_AFTER = 3;

// Risposta del backend -> { online, since } oppure null se non e' leggibile.
// `settled: false` = backend appena partito, stato iniziale non ancora misurato
// (direbbe "online" anche a linea giu'): sconosciuto. Campo assente = backend
// vecchio, si legge com'e'.
const parseHealth = (data) => {
    if (!data || typeof data !== 'object' || typeof data.online !== 'boolean') return null;
    if (data.settled === false) return null;
    const since = typeof data.since === 'string' ? Date.parse(data.since) : NaN;
    return { online: data.online, since: Number.isFinite(since) ? since : null };
};

// Minuti interi da `since` (mai negativi: orologi di pagina e backend sono lo
// stesso Beelink, ma da remoto possono divergere di qualche secondo).
const minutesOffline = (since, nowMs) => {
    if (since === null || since === undefined) return null;
    return Math.max(0, Math.floor((nowMs - since) / 60000));
};

// Prossimo stato del banner dato quello precedente e la lettura appena fatta.
//   'hidden'  niente da dire
//   'offline' manca internet
//   'back'    era offline e ora e' tornato (dura BACK_ONLINE_MS, lo spegne il timer)
// Lettura illeggibile (null) = si tiene lo stato com'e': un backend che salta un
// giro non accende ne' spegne niente. Dopo UNKNOWN_HIDE_AFTER letture
// illeggibili di fila (`unknownStreak`, contata dal chiamante) si spegne:
// meglio nessun avviso che uno fermo da chissa' quando.
const nextBannerState = (prev, health, unknownStreak = 0) => {
    if (health === null) return unknownStreak >= UNKNOWN_HIDE_AFTER ? 'hidden' : prev;
    if (!health.online) return 'offline';
    return prev === 'hidden' ? 'hidden' : 'back';
};

module.exports = {
    POLL_INTERVAL_MS,
    FETCH_TIMEOUT_MS,
    BACK_ONLINE_MS,
    UNKNOWN_HIDE_AFTER,
    parseHealth,
    minutesOffline,
    nextBannerState,
};
