// Copyright (C) 2017-2026 Smart code 203358507

// Casa: percentuale accanto ai MB scaricati nel pannello statistiche.
//
// ⚠️ Il denominatore e' la dimensione del FILE in riproduzione, non del
// torrent: su un season pack "il 12% del torrent" non dice niente a chi sta
// guardando un episodio. TorrServer espone `file_stats`; con un file solo la
// scelta e' ovvia, con un pack si prende il piu' grande — approssimazione
// dichiarata: gli episodi di un pack hanno dimensioni simili, e il numero
// serve a rispondere "manca molto?", non a fare contabilita'.
//
// ⚠️ Sta sulla STESSA base dei MB gia' mostrati (`bytes_read_useful_data`, che
// e' per-sessione): quindi eredita lo stesso limite, scritto in useStatistics —
// se i pezzi erano gia' in cache su disco, si guarda il film con pochi MB e
// poca percentuale. La parentesi non aggiunge una bugia nuova, dice in
// proporzione quello che il numero accanto dice in MB.

// files: `file_stats` di TorrServer ([{length}]). Torna la lunghezza da usare
// come denominatore, o null se non e' deducibile.
const targetFileLength = (files) => {
    if (!Array.isArray(files) || files.length === 0) return null;
    const lengths = files.map((f) => (f && +f.length) || 0).filter((n) => n > 0);
    if (lengths.length === 0) return null;
    return Math.max(...lengths);
};

// Torna la percentuale (0-100, un decimale) o null se non calcolabile.
const downloadedPercent = (downloadedBytes, fileLength) => {
    if (typeof downloadedBytes !== 'number' || !isFinite(downloadedBytes) || downloadedBytes < 0) return null;
    if (typeof fileLength !== 'number' || !isFinite(fileLength) || fileLength <= 0) return null;
    const pct = (downloadedBytes / fileLength) * 100;
    // Il cap a 100 non e' cosmetico: i byte "utili" letti possono superare la
    // dimensione del file (ri-letture), e "137%" sembrerebbe un bug.
    return Math.round(Math.min(100, pct) * 10) / 10;
};

module.exports = { targetFileLength, downloadedPercent };
