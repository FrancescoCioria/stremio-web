// Copyright (C) 2026 — Casa TV fork
//
// Il marchio Letterboxd (i tre pallini) accanto al voto, nell'hero della home
// e nel dettaglio.
//
// ⚠️ Geometria e colori sono quelli UFFICIALI, copiati dallo sprite di
// letterboxd.com (`LB-icon-28h`, l'icona senza sfondo in alto a sinistra in
// https://s.ltrbxd.com/static/img/sprite-<hash>.svg): cerchi r=14 a
// cx 14 / 38 / 62, `#ff8000` `#00e054` `#40bcf4`, e le due lenti BIANCHE
// nelle sovrapposizioni. La versione precedente erano tre `<span>` tondi
// staccati, disegnati a mano in CSS: ordine dei colori sbagliato (verde, blu,
// arancione) e nessuna sovrapposizione — non era il logo, gli somigliava.
//
// ⚠️ Le lenti bianche NON sono un errore su sfondo scuro: sul tema scuro di
// letterboxd.com stesso il marchio si vede cosi', con i due spicchi chiari a
// separare i pallini. Su fondo chiaro spariscono nel bianco della pagina, che
// e' esattamente come e' disegnato.
//
// SVG inline e non un PNG: scala senza sfocare a qualunque dimensione (la TV
// e' 4K) e non aggiunge una richiesta di rete a una pagina che deve partire
// anche con la linea lenta.

const React = require('react');

// L'altezza la decide il CSS del chiamante (`height: 1em` o simili): il
// rapporto 76:28 lo tiene il viewBox.
const LetterboxdMark = ({ className }) => (
    <svg
        className={className}
        viewBox={'0 0 76 28'}
        role={'img'}
        aria-label={'Letterboxd'}
        focusable={'false'}
    >
        <circle cx={'14'} cy={'14'} r={'14'} fill={'#ff8000'} />
        <circle cx={'62'} cy={'14'} r={'14'} fill={'#40bcf4'} />
        <circle cx={'38'} cy={'14'} r={'14'} fill={'#00e054'} />
        <path
            fill={'#fff'}
            d={'M50 6.785C51.27 8.892 52 11.361 52 14 52 16.639 51.27 19.108 50 21.215 48.73 19.108 48 16.639 48 14 48 11.388 48.715 8.943 49.961 6.85ZM26 6.785C27.27 8.892 28 11.361 28 14 28 16.639 27.27 19.108 26 21.215 24.73 19.108 24 16.639 24 14 24 11.388 24.715 8.943 25.961 6.85Z'}
        />
    </svg>
);

module.exports = LetterboxdMark;
