// Versione "Casa" del fork stremio-web. Mostrata in Settings (Menu) accanto
// alle altre versioni, cosi' dalla TV si vede A COLPO D'OCCHIO quale build sta
// girando: se la tile serve un bundle vecchio dalla cache del service worker,
// questo numero (o l'hash di commit accanto) NON corrisponde all'ultimo deploy.
// BUMPA AD OGNI DEPLOY della tile (fa parte del commit di deploy, non opzionale).
// Durante lo sviluppo usa i MINOR per le iterazioni ravvicinate (v3 -> v3.1 ->
// v3.2 ...); il MAJOR (v4) solo per un cambiamento sostanziale. Cosi' non si
// arriva a v970 in una settimana.
export const CASA_VERSION = 'v4.12';
