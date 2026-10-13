// Ordine dei risultati di ricerca (Casa): premio "freshness" sull'ordine di
// Cinemeta. Un titolo sale sopra quello che lo precede SOLO se:
//   - e' piu' recente (anno);
//   - ha voti IMDb simili: rapporto <= VOTES_RATIO (2 = al massimo il doppio);
//   - non scavalca il titolo identico alla ricerca ("Psycho" resta sopra
//     "American Psycho").
// Titoli senza voti (non usciti, sconosciuti) sono trasparenti: non bloccano.
// Fuori da questi casi resta l'ordine di Cinemeta: nessuna regola sui
// franchise, i film poco votati (fan film, spazzatura) non si muovono.
//
// Taratura 14/10/2026 su 77 righe (cronologia di ricerca + 25 query a rischio:
// titoli secchi, remake, franchise). Rapporto 1,5 / 2 / 3: ordine cambiato in
// 33 / 44 / 49 righe, primo risultato cambiato 1 / 2 / 3, titolo esatto sceso
// 0 / 1 / 2 (l'1 = Halloween 2018 sopra il 1978, stesso titolo). Discese
// grandi solo dentro i franchise (Harry Potter 1: 1 -> 8, voluto).

const VOTES_RATIO = 2;

const norm = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const yearOf = (item) => {
    const y = parseInt(item && (item.releaseInfo ?? item.year), 10);
    return y > 0 ? y : null;
};

// items = lista nell'ordine di Cinemeta; votes = { [imdbId]: numero }.
// Ritorna una NUOVA lista (stessi oggetti).
const freshnessOrder = (items, query, votes) => {
    const q = norm(query);
    const out = [];
    for (const item of items) {
        const v = votes[item.id] || 0;
        const y = yearOf(item);
        let at = out.length;
        if (v > 0 && y !== null) {
            const exact = q.length > 0 && norm(item.name) === q;
            for (let k = out.length; k > 0; k--) {
                const prev = out[k - 1];
                const pv = votes[prev.id] || 0;
                if (pv === 0) continue;
                if (!exact && q.length > 0 && norm(prev.name) === q) break;
                const py = yearOf(prev);
                if (py === null || y <= py || Math.max(v, pv) / Math.min(v, pv) > VOTES_RATIO) break;
                at = k - 1;
            }
        }
        out.splice(at, 0, item);
    }
    return out;
};

module.exports = { freshnessOrder, VOTES_RATIO };
