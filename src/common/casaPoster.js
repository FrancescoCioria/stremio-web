// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: poster di una card di libreria (Continua a guardare) che ne e' senza.
// La library salva il poster dalla scheda al momento dell'aggiunta: con una
// scheda Cinemeta GREZZA (883, tt42026819, 25/10/2026: niente poster) la card
// restava col televisore grigio per sempre. Ripiego = lo stesso indirizzo che
// Cinemeta usa per i poster dei suoi cataloghi (metahub, per id IMDb), che per
// quel titolo esiste. Puro.

const posterFallback = (poster, id) => {
    if (typeof poster === 'string' && poster.length > 0) return poster;
    const m = typeof id === 'string' ? id.match(/^(tt\d+)/) : null;
    return m ? `https://images.metahub.space/poster/small/${m[1]}/img` : poster;
};

module.exports = { posterFallback };
