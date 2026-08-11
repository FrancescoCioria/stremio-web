// Copyright (C) 2017-2023 Smart code 203358507
//
// Casa: quanti secondi di video il CLIENT ha davvero davanti alla testina.
//
// Perche' esiste (2026-08-12): sia la barra sia il pannello statistiche
// mostravano un "buffer" derivato da `statistics.completed`, cioe'
// `preloaded_bytes / torrent_size` di TorrServer. Quel rapporto NON e' una
// finestra davanti alla testina: `preloaded_bytes` e' inchiodato alla
// **dimensione della cache** (6 GiB), quindi su un film piu' grande della cache
// resta una COSTANTE (61,46% su un file da 10,5 GB) qualunque cosa succeda.
// Effetto: il pannello diceva "Buffer: 67m 54s" mentre il client ne aveva 18,
// e la barra disegnava il riempimento a `time + 68 minuti`, cioe' sempre piena.
//
// La metrica utile e' una sola e viene dal browser: `videoElement.buffered`
// (fine del range che contiene la testina, in ms) meno il tempo corrente.
// Misurata sulla serata del 11/08: media 18s, max 30,8s, e ZERO quando il film
// si fermava — cioe' esattamente il numero che spiega gli stop.
//
// ⚠️ Il download del torrent NON e' piu' il collo di bottiglia da quando
// c'e' TorrServer: mostrare la finestra scaricata era informazione del 2025.
// Quello che oggi si vuole vedere e' la scorta del client. Vedi
// `docs/stremio-remote-playback.md`.

// `buffered` e `time` sono in ms (le unita' di `video.state`). Ritorna ms, o
// null se uno dei due non c'e' ancora (player che carica, stream scaricato).
const bufferAheadMs = (buffered, time) => {
    if (typeof buffered !== 'number' || !isFinite(buffered)) return null;
    if (typeof time !== 'number' || !isFinite(time)) return null;
    // Mai negativo: dopo un seek in avanti `buffered` puo' restare indietro per
    // qualche frame, e un "-3s" nel pannello sarebbe solo rumore.
    return Math.max(0, buffered - time);
};

module.exports = bufferAheadMs;
module.exports.bufferAheadMs = bufferAheadMs;
