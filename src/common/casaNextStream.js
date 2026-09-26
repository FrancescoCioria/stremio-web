// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: quale torrent apre "episodio successivo" (bottone o fine episodio).
//
// Il core apre il primo stream dell'N+1 con lo stesso bingeGroup, anche se e'
// morto (President Curtis S1E6, 26/09/2026: 5 seeder contro 239, mai partito).
// La scelta vera la fa il backend (`pickNextStream` in stremio_addon.ts, la
// stessa che usa il prewarm): se il binge e' debole torna il piu' seedato della
// stessa risoluzione, e qui si sostituisce lo stream nel deep link del player.
// Mai la pagina torrent: si apre direttamente il player.
//
// Fail-open: backend muto oltre NEXT_STREAM_TIMEOUT_MS, errore, nessun binge
// match -> deep link del core invariato (comportamento di prima).

const { casaBackendUrl, casaBeacon } = require('./casaBackend');
const { hashFromUrl } = require('./torrentRace');
const { streamHeight } = require('./casaStreamHeight');

// Di solito la risposta e' gia' in cache dal prewarm (ms). Senza, il backend
// interroga Torrentio: oltre questo si apre il binge del core, come prima.
const NEXT_STREAM_TIMEOUT_MS = 3000;

// `#/player/<stream codificato>/<transport addon>/...`: si cambia solo il
// secondo segmento dopo `#/`. Link non riconosciuto -> null.
const withPlayerStream = (playerLink, encodedStream) => {
    if (typeof playerLink !== 'string' || typeof encodedStream !== 'string') return null;
    const parts = playerLink.split('/');
    if (parts[0] !== '#' || parts[1] !== 'player' || parts.length < 3) return null;
    parts[2] = encodeURIComponent(encodedStream);
    return parts.join('/');
};

// deepLinks del successivo, con lo stream sostituito se il backend lo dice.
const resolveNextDeepLinks = async ({ deepLinks, currentStream, type, nextVideoId, encodeStream }) => {
    const player = deepLinks && deepLinks.player;
    const currentHash = currentStream && currentStream.url && hashFromUrl(currentStream.url);
    if (typeof player !== 'string' || !currentHash || typeof nextVideoId !== 'string') return deepLinks;
    const bh = currentStream.behaviorHints || {};
    const qs = new URLSearchParams({
        type: type || 'series',
        id: nextVideoId,
        bingeGroup: bh.bingeGroup || '',
        currentHash,
        height: String(streamHeight(currentStream)),
    });
    const url = casaBackendUrl('/stremio-addon/next-stream?' + qs.toString());
    if (!url) return deepLinks;
    const t0 = Date.now();
    let reason = 'error';
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(NEXT_STREAM_TIMEOUT_MS) });
        const j = await res.json();
        reason = (j && j.reason) || 'none';
        if (reason !== 'weak-binge' || !j.stream) return deepLinks;
        const encoded = await encodeStream(j.stream);
        const link = withPlayerStream(player, encoded);
        if (!link) {
            reason = 'bad-link';
            return deepLinks;
        }
        return { ...deepLinks, player: link };
    } catch (e) {
        reason = e && e.name === 'TimeoutError' ? 'timeout' : 'error';
        return deepLinks;
    } finally {
        casaBeacon('/debug/player-event', { ev: 'casa-next-stream', nextVideoId, reason, ms: Date.now() - t0 });
    }
};

module.exports = { withPlayerStream, resolveNextDeepLinks, NEXT_STREAM_TIMEOUT_MS };
