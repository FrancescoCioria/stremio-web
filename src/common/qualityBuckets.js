// Copyright (C) 2017-2023 Smart code 203358507
//
// Logica pura per la modalita' "Auto" della lista stream: raggruppa gli stream in
// 3 bucket di qualita' (4K / 1080p / 720p) e calcola per ognuno un micro-recap
// (numero torrent + dimensione media) per guidare l'utente ("vale la pena il 4K o
// meglio 1080p?"). Nessuna dipendenza da React/DOM -> testabile a parte.

const BUCKET_4K = '4K';
const BUCKET_1080 = '1080p';
const BUCKET_720 = '720p';
const BUCKET_ORDER = [BUCKET_4K, BUCKET_1080, BUCKET_720];

// Etichette user-facing (con hint sul "quanto costa" in banda/dimensione).
const BUCKET_LABEL = {
    [BUCKET_4K]: '4K',
    [BUCKET_1080]: '1080p',
    [BUCKET_720]: '720p'
};

// Altezza (px) -> bucket. Sconosciuta (0) -> 1080p (default piu' comune): meglio
// tenerla in gara che perderla; la race verifica comunque la qualita' reale.
const heightToBucket = (h) => {
    if (h >= 2160) return BUCKET_4K;
    if (h >= 1080) return BUCKET_1080;
    if (h > 0) return BUCKET_720;
    return BUCKET_1080;
};

// Dimensione dal testo (emoji 💾 seguito da "N.NN GB/MB/..."). Ritorna byte, 0 se
// assente. Base 1024 (le size torrent sono binarie). Gestisce sia "1.79" che "1,79".
const SIZE_RE = /\u{1F4BE}\s*([\d]+(?:[.,]\d+)?)\s*([KMGT])i?B/u;
const UNIT_MULT = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
const parseSizeBytes = (text) => {
    if (typeof text !== 'string') return 0;
    const m = text.match(SIZE_RE);
    if (!m) return 0;
    const val = parseFloat(m[1].replace(',', '.'));
    if (!isFinite(val)) return 0;
    return Math.round(val * (UNIT_MULT[m[2].toUpperCase()] || 1));
};

// Uno stream e' "buono" per l'Auto se e' compatibile e non e' un torrent morto o
// un pack (raccolta multi-film). health/packByName/incompatible arrivano gia'
// calcolati dall'enrichment di StreamsList (sidecar salute + regex nome). Gli
// stream con salute non ancora risolta (healthChecking) restano inclusi: la race
// e' il vero health-check.
const isGoodForAuto = (s) => {
    if (!s) return false;
    if (s.incompatible) return false;
    if (s.health === 'dead') return false;
    if (s.health === 'pack' || s.packByName) return false;
    if (typeof s.infoHash !== 'string') return false; // serve un torrent (no url diretti/yt)
    return true;
};

// Media (bytes) ignorando gli 0 (size sconosciuta): non azzerare la media solo
// perche' un torrent non dichiara la dimensione.
const avgBytes = (streams) => {
    const sizes = streams.map((s) => (typeof s.sizeBytes === 'number' ? s.sizeBytes : 0)).filter((n) => n > 0);
    if (sizes.length === 0) return 0;
    return Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length);
};

// computeBuckets(streams) -> { '4K': {count, avgBytes, streams}, '1080p': {...}, '720p': {...} }
// `streams` = stream gia' arricchiti (devono avere: height, sizeBytes, seeders,
// incompatible, health, packByName, infoHash, fileIdx, sources, deepLinks).
// Ogni bucket.streams e' ordinato per seeder desc (candidati race: piu' seedati prima).
const computeBuckets = (streams) => {
    const buckets = {
        [BUCKET_4K]: [],
        [BUCKET_1080]: [],
        [BUCKET_720]: []
    };
    (Array.isArray(streams) ? streams : []).forEach((s) => {
        if (!isGoodForAuto(s)) return;
        const b = heightToBucket(typeof s.height === 'number' ? s.height : 0);
        buckets[b].push(s);
    });
    const result = {};
    BUCKET_ORDER.forEach((key) => {
        const list = buckets[key].slice().sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
        result[key] = {
            key,
            label: BUCKET_LABEL[key],
            count: list.length,
            avgBytes: avgBytes(list),
            streams: list
        };
    });
    return result;
};

// Formattazione dimensione media per la UI (es. "~18 GB", "~750 MB", "" se 0).
const formatAvgSize = (bytes) => {
    if (!bytes || bytes <= 0) return '';
    const gb = bytes / (1024 ** 3);
    if (gb >= 1) return '~' + (gb >= 10 ? Math.round(gb) : gb.toFixed(1)) + ' GB';
    const mb = bytes / (1024 ** 2);
    return '~' + Math.round(mb) + ' MB';
};

module.exports = {
    BUCKET_4K, BUCKET_1080, BUCKET_720, BUCKET_ORDER, BUCKET_LABEL,
    heightToBucket, parseSizeBytes, isGoodForAuto, avgBytes, computeBuckets, formatAvgSize
};
