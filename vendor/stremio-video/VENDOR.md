# `@stremio/stremio-video` — vendorizzato (fork Casa)

Copia di `@stremio/stremio-video@0.0.80` (upstream: https://github.com/Stremio/stremio-video),
importata nel repo il **2026-07-11** e da qui in poi **mantenuta da noi**. La
dipendenza in `package.json` punta a `file:./vendor/stremio-video`.

## Perche' vendorizzato (e non piu' una pnpm patch)

Era una `patches/@stremio__stremio-video@0.0.80.patch`, agganciata alla **versione
esatta**. Problemi concreti:

- Il player e' il pezzo che ci da' i guai (micro-stall `maxBufferHole`, render-loop
  dei sottotitoli che moriva, append MSE che non completa — 2026-07-11), quindi lo
  tocchiamo spesso. Patchare a cieca un pacchetto in `node_modules` e' il modo
  peggiore di lavorare su un file che devi leggere e debuggare.
- Upstream rilascia **quasi solo bump di questo pacchetto** (0.0.81 → 0.0.83 in tre
  settimane): ogni bump ci obbligava a **rigenerare la patch** e ri-verificare che
  gli hunk applicassero. L'unica cosa che upstream produce era anche quella che ci
  costava di piu' assorbire.
- Qui il sorgente e' leggibile, diffabile e debuggabile come il resto del repo:
  7.651 righe di JS in chiaro, nessun build step (il `main` e' `src/index.js`, lo
  compila il webpack di stremio-web).

## Cosa abbiamo cambiato rispetto a 0.0.80 (cerca `Casa:` nel sorgente)

1. **`src/HTMLVideo/hlsConfig.js`**
   - `maxMaxBufferLength` 80 → **300s** + `maxBufferSize` 60MB → **500MB**. La
     formula di hls.js e' `min(maxMaxBufferLength, max(8*maxBufferSize/bitrate,
     maxBufferLength))`: col default 60MB il buffer si fermava a ~48s @10Mbps, quindi
     alzare solo `maxMaxBufferLength` era **inefficace**. Serve a bancare minuti di
     buffer per la riproduzione da fuori casa (4G/LTE). Vedi
     `home-server/docs/stremio-remote-playback.md`.
   - `maxBufferHole` 0 → **0.5** (= default hls.js). Con 0, ogni micro-gap audio ai
     confini dei frammenti HLS transcodificati (AAC) veniva letto come
     `bufferStalledError` → stall + nudge di ~1s. Rif. hls.js#6169, risolto upstream
     solo in 1.6.0 (PR#6972); `hls.js` qui e' pinnato a `1.5.4-patch2` (tarball
     Stremio) → serve l'override.

2. **`src/withHTMLSubtitles/withHTMLSubtitles.js`** — `try/catch` attorno a
   `renderSubtitles()` dentro il loop `requestAnimationFrame`. Un'eccezione (tipico:
   `vtt.js convertCueToDOMTree` su una cue con markup ostico) usciva **prima** di
   rischedulare il rAF → loop morto per sempre, e `startRenderLoop` non lo rianima
   (`rafId` resta non-null). Sintomo: i sottotitoli si spengono "dopo un po'" e
   tornano solo cambiando e rimettendo la traccia.

## Aggiornarlo da upstream

Non e' automatico ed e' voluto: e' una scelta, non un obbligo. Quando serve
davvero (bug fix upstream che ci interessa):

```bash
git clone --depth 1 --branch <tag> https://github.com/Stremio/stremio-video /tmp/sv
diff -ru /tmp/sv/src vendor/stremio-video/src   # cosa cambia davvero
```
Poi porta a mano quello che serve, tenendo i blocchi `Casa:`. `hls.js` e' una
dipendenza di QUESTO package.json: si puo' bumpare da qui, senza toccare upstream.
