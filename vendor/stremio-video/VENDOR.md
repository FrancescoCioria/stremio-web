# `@stremio/stremio-video` — vendorizzato (fork Casa)

Copia di `@stremio/stremio-video@0.0.80` (upstream: https://github.com/Stremio/stremio-video),
importata nel repo il **2026-07-11** e da qui in poi **mantenuta da noi**.

> ⚠️ **E' un WORKSPACE PACKAGE, non una dipendenza `file:`.** `pnpm-workspace.yaml`
> ha `packages: [vendor/stremio-video]` e il root dipende con `"workspace:*"`.
> **Non tornare a `file:`**: pnpm COPIA il pacchetto nello store invece di linkarlo,
> quindi **editi `vendor/` e la modifica NON arriva nel bundle** finche' non rifai
> `pnpm install` (bruciata mezz'ora il 2026-07-11: `enableWorker: false` restava
> `true` nel bundle). E nemmeno `link:`: e' un symlink nudo, pnpm non installa le
> dipendenze del pacchetto -> 31 "Module not found". Come workspace, `node_modules/
> @stremio/stremio-video` e' un **symlink vero** a questa cartella: quello che editi
> e' quello che gira. Verifica dopo ogni modifica: `grep -o "<il tuo valore>"
> build/*/scripts/main.js`.

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

2. **`src/HTMLVideo/hlsConfig.js` — `enableWorker: true` → `false`** (2026-07-11).
   hls.js costruisce il worker inline **stringificando una funzione**
   (`__HLS_WORKER_BUNDLE__.toString()`) e valutandola dentro un Blob; il Terser di
   stremio-web hoista/rinomina simboli fuori da quella funzione, che nel blob non
   esistono → `ReferenceError: e is not defined` alla prima riproduzione (pescato dal
   nostro `stremio-js-errors.log`). hls.js intercetta e ripiega da solo sul main
   thread — il video parte lo stesso — ma e' un fallback silenzioso. **A noi il worker
   non serve**: serve a demuxare MPEG-TS, mentre `server.js` ci consegna **fMP4**
   (`init.mp4` + `.m4s`) → il transmuxer e' quasi un passacarte. Con `false` il
   comportamento e' identico, ma deterministico e senza errore.

3. **`src/withHTMLSubtitles/withHTMLSubtitles.js`** — `try/catch` attorno a
   `renderSubtitles()` dentro il loop `requestAnimationFrame`. Un'eccezione (tipico:
   `vtt.js convertCueToDOMTree` su una cue con markup ostico) usciva **prima** di
   rischedulare il rAF → loop morto per sempre, e `startRenderLoop` non lo rianima
   (`rafId` resta non-null). Sintomo: i sottotitoli si spengono "dopo un po'" e
   tornano solo cambiando e rimettendo la traccia.

4. **`src/HTMLVideo/casaHlsProbe.js`** (file NOSTRO) + 3 righe in `HTMLVideo.js` —
   osservabilita' **PERMANENTE** del player (2026-07-13). **Non rimuoverla**: e' cio'
   che impedisce di tornare ciechi sugli stall.
   - Emette `hls-stall` (freeze CONCLUSO, con `durationMs` + `jumpMs` + il buco +
     buffer per SourceBuffer), `hls-stall-open` (freeze ancora aperto oltre 8s: senza,
     un player appeso per sempre non lascerebbe **nessuna** riga), `hls-error` (il
     gap-controller colto sul fatto) e un battito `hls-buffer` ogni 30s.
   - **Perche' `durationMs` e' il campo centrale**: il log che avevamo (`player-state`)
     diceva `buffering: true` ma **mai se e per quanto l'immagine si era fermata**. Il
     2026-07-13 questo ha prodotto due diagnosi sbagliate: eventi di buffering da ~0.8s
     che l'utente NON vedeva (transizioni interne, nessun frame perso) contati come
     hiccup; e gli stall attribuiti ai micro-gap dell'AAC quando i buchi erano nel
     **VIDEO** e l'audio era 300s avanti e pulito. Un log che non separa "si e' visto"
     da "non si e' visto" non e' osservabilita': e' rumore che sembra evidenza.
   - **Perche' per-SourceBuffer**: `videoElement.buffered` e' l'**intersezione** di
     video e audio → nasconde esattamente il caso "audio pieno, video bucato".

## `hls.js`: dal fork Stremio all'ufficiale (2026-07-11)

Era `https://github.com/Stremio/hls.js/.../v1.5.4-patch2.tgz` — un **fork di Stremio
della 1.5.4**, scaricato da un tarball su GitHub. Quel fork esiste per **una** feature:
**HEVC dentro MPEG-TS** (PR #5847). Non ci serve (noi riceviamo **fMP4**, non TS) e
upstream l'ha comunque assorbita (la 1.6.16 ha HEVC nel `tsdemuxer`). Ora: **`hls.js`
ufficiale da npm, 1.6.16**.

API verificate una per una sul sorgente 1.6: `attachMedia`, `loadSource`, `destroy`,
`detachMedia`, `audioTrack`, `subtitleTrack`, `on`, `removeAllListeners`,
`isSupported`, `setAudioOption`, eventi `MANIFEST_LOADING`/`AUDIO_TRACKS_UPDATED`/
`AUDIO_TRACK_SWITCHED`. Tutte presenti.

La 1.6 include anche il fix upstream del gap-controller (PR#6972) per gli stall sui
micro-gap audio — il bug che tamponavamo con `maxBufferHole`. **Il tuning e' rimasto
0.5 di proposito** (una variabile per volta): si potra' rivalutare il ritorno al
default (0.1) dopo un po' di 1.6 sul campo.

## Aggiornarlo da upstream

Non e' automatico ed e' voluto: e' una scelta, non un obbligo. Quando serve
davvero (bug fix upstream che ci interessa):

```bash
git clone --depth 1 --branch <tag> https://github.com/Stremio/stremio-video /tmp/sv
diff -ru /tmp/sv/src vendor/stremio-video/src   # cosa cambia davvero
```
Poi porta a mano quello che serve, tenendo i blocchi `Casa:`. `hls.js` e' una
dipendenza di QUESTO package.json: si puo' bumpare da qui, senza toccare upstream.
