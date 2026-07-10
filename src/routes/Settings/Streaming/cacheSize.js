// Casa custom (NON upstream): logica pura dello slider "Cache size" (0-60GB,
// step 5). Estratta per i test jest (come torrentRace.js): niente React/CSS qui.
// Il valore e' settings.cacheSize di server.js = tetto della disk-cache TorrServer
// letto dal prune torrserver-cache-prune.py. Vedi docs/stremio-torrserver.md.
const GiB = 1024 * 1024 * 1024;
const STEP = 5; // GB
const MAX = 60; // GB

const clampGb = (gb) => Math.min(MAX, Math.max(0, gb));

// bytes (o null=infinito / invalidi) -> GB snappato allo step. null -> MAX.
const bytesToGb = (bytes) =>
    (bytes === null || bytes === undefined || !isFinite(bytes))
        ? MAX
        : clampGb(Math.round((bytes / GiB) / STEP) * STEP);

const gbToBytes = (gb) => clampGb(gb) * GiB;

const gbLabel = (gb) => (gb === 0 ? 'No caching' : `${gb} GiB`);

// nuovo valore GB per una freccia, o null se il tasto non ci riguarda: cosi'
// ArrowUp/Down passano oltre e la spatial-nav cambia riga.
const nextGbForKey = (key, gb) => {
    if (key === 'ArrowRight') return clampGb(gb + STEP);
    if (key === 'ArrowLeft') return clampGb(gb - STEP);
    return null;
};

module.exports = { GiB, STEP, MAX, clampGb, bytesToGb, gbToBytes, gbLabel, nextGbForKey };
