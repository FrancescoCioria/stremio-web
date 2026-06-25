// Copyright (C) 2017-2023 Smart code 203358507

// Preselezione del torrent "corrente" al ritorno dal player.
// Il core non espone quale stream stai guardando (gli oggetti Stream non hanno
// progress/selected), quindi ce lo ricordiamo noi: quando parte un player
// salviamo (videoId, chiave-stream); quando si rientra nella lista stream,
// StreamsList rimette il focus sulla card corrispondente.
// Single-entry: ricordiamo solo l'ultimo (si torna indietro dal player in cui
// si era appena entrati), cosi' niente crescita illimitata di localStorage.

const STORAGE_KEY = 'casa:lastStream';

// Chiave stabile che identifica lo stesso stream tra Player e StreamsList.
// infoHash+fileIdx per i torrent; url/ytId per gli altri.
const streamKey = (stream) => {
    if (!stream) return null;
    if (typeof stream.infoHash === 'string' && stream.infoHash) {
        const fileIdx = (stream.fileIdx !== null && stream.fileIdx !== undefined) ? String(stream.fileIdx) : '';
        return 'ih:' + stream.infoHash.toLowerCase() + ':' + fileIdx;
    }
    if (typeof stream.url === 'string' && stream.url) return 'url:' + stream.url;
    if (typeof stream.ytId === 'string' && stream.ytId) return 'yt:' + stream.ytId;
    return null;
};

// L'infoHash del torrent e' univoco a livello globale, quindi NON leghiamo la
// memoria al video: ricordiamo solo l'ultimo streamKey riprodotto. Al ritorno,
// se una card con quella chiave esiste nella lista corrente, e' QUELLA giusta
// (su un altro film non c'e' -> nessun match -> nessun danno). Legarlo a un
// videoId causava mismatch (il videoId differiva tra continue-watching, click
// dalla lista e prop di StreamsList) -> recall null -> focus sbagliato/assente.
const rememberStream = (stream) => {
    const key = streamKey(stream);
    if (!key) return;
    try {
        localStorage.setItem(STORAGE_KEY, key);
    } catch (_e) { /* storage negato/pieno: niente preselezione, nessun danno */ }
};

const recallStreamKey = () => {
    try {
        return localStorage.getItem(STORAGE_KEY) || null;
    } catch (_e) { return null; }
};

module.exports = { streamKey, rememberStream, recallStreamKey };
