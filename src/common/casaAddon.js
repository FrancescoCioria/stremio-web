// Casa: identita' del NOSTRO addon di cataloghi (backend `stremio_addon.ts`).
//
// Le righe della home sono solo le sue: la home e' fatta in casa (ultime
// uscite film / serie / dai tuoi show e registi / animazione) e ogni altro
// catalogo installato ripeterebbe gli stessi titoli con un ordine suo.
//
// ⚠️ Il filtro sta QUI, nel fork, e NON nella collezione di addon salvata
// sull'account. Toglierlo dai dati era il modo "definitivo" e si e' rivelato
// il modo sbagliato: il 2026-08-30 la pulizia della home aveva svuotato i
// `catalogs` di Cinemeta, e il 2026-09-01 la RICERCA e' risultata morta
// ("No addons were requested for catalogs!") — perche' l'unico catalogo che
// dichiara `search` e' proprio il `top` di Cinemeta, che in home non si vede
// nemmeno. Stessa scrittura si portava via `calendar-videos` (la nostra
// agenda) e `last-videos` (le notifiche di nuovi episodi): tre funzioni
// spente per nascondere due righe.
//
// Un catalogo serve a piu' pagine; la home e' solo una di quelle. Chi decide
// cosa si vede in home e' la home.
const CASA_ADDON_ID = 'casa.home.lists';

// Vero se il catalogo del Board e' uno dei nostri (quindi si disegna).
const isCasaHomeCatalog = (catalog) => catalog?.addon?.manifest?.id === CASA_ADDON_ID;

module.exports = { CASA_ADDON_ID, isCasaHomeCatalog };
