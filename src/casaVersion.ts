// Versione "Casa" del fork stremio-web. Mostrata in Settings (Menu) accanto
// alle altre versioni, cosi' dalla TV si vede A COLPO D'OCCHIO quale build sta
// girando: se la tile serve un bundle vecchio dalla cache del service worker,
// questo numero (o l'hash di commit accanto) NON corrisponde all'ultimo deploy.
// Bumpare a ogni deploy significativo del fork.
export const CASA_VERSION = 'v3';
