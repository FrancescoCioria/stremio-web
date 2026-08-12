module.exports = {
    debug: false,
    // Casa: worker OFF (era true). hls.js costruisce il worker inline
    // STRINGIFICANDO una funzione (`__HLS_WORKER_BUNDLE__.toString()`) e
    // valutandola dentro un Blob: il nostro Terser, minificando, hoista/rinomina
    // simboli FUORI da quella funzione -> dentro il blob non esistono ->
    // "ReferenceError: e is not defined" (visto in stremio-js-errors.log alla
    // prima riproduzione con hls.js 1.6.16). hls.js intercetta e ripiega da solo
    // sul main thread, quindi il video parte lo stesso: ma e' un fallback
    // silenzioso, e un errore che non spiegheremmo piu' fra sei mesi.
    // A NOI il worker non serve: serve a demuxare MPEG-TS, mentre il transcode di
    // server.js ci consegna fMP4 (init.mp4 + segmenti .m4s) -> il transmuxer e'
    // quasi un passacarte. Spegnendolo il comportamento e' lo stesso, ma
    // deterministico e senza errore. 2026-07-11.
    enableWorker: false,
    // Casa: false (default hls.js = true). Su Safari hls.js sceglie
    // `ManagedMediaSource` invece di `MediaSource` quando c'e' — e con MMS **e' il
    // sistema operativo a decidere quanto bufferizzare**: manda `startstreaming`/
    // `endstreaming` e hls.js smette di scaricare quando glielo dice. MMS nasce per
    // non far accumulare 60s di buffer a un iPhone con poca memoria; su un Mac che
    // guarda un film da fuori casa e' esattamente il contrario di cio' che serve.
    // Misurato 2026-08-12, stesso film 4K HEVC (~11,5 Mbps) via Tailscale:
    //   Safari  (MMS)        max  30,8s e  30,6s in due sessioni — 252 campioni
    //   Chromium (MSE)       max  91,4s e 156,8s
    // ⚠️ La firma che inchioda MMS: su Safari **zero `bufferFullError`** in 252
    // campioni, mentre Chromium ne emette a raffica. MMS non lancia errori di
    // quota — dice "smetti", e hls.js obbedisce in silenzio. Quindi il nostro
    // `maxMaxBufferLength: 300` li' non e' mai stato al comando.
    // NON e' la quota di WebKit a mordere: il budget e' ~290MB per il video
    // (318.767.104 byte totali, 95% video / 5% audio), cioe' 7x i ~42MB misurati.
    // Costo: si perde l'AirPlay dal player (con la MSE classica non c'era comunque)
    // e il risparmio memoria/batteria di MMS, che su un Mac alla spina non serve.
    // Verifica: evento `hls-mediasource` nel player-debug log (casaHlsProbe.js).
    preferManagedMediaSource: false,
    lowLatencyMode: false,
    backBufferLength: 30,
    maxBufferLength: 50,
    // Casa: 80->300s (5 min) per bancare buffer da remoto (4G/LTE). Va alzato
    // ANCHE maxBufferSize: la formula hls.js e'
    // min(maxMaxBufferLength, max(8*maxBufferSize/bitrate, maxBufferLength)),
    // col default 60MB il buffer si fermava a ~48s @10Mbps -> maxMaxBufferLength
    // da solo era inefficace. 500MB -> ~400s @10Mbps (cappati a 300 = 5 min);
    // su VBR 1080p ~15Mbps ~266s. Banca minuti su rete buona -> scavalca i picchi
    // VBR + i cali di cella, e la PAUSA diventa utile (banchi minuti, non 80s).
    // Costa RAM browser client + re-buffer al seek; aiuta solo se banda media >=
    // bitrate (regime 1). Se il browser sfora la quota MSE, hls.js degrada da
    // solo (reduceMaxBufferLength). 2026-07-06.
    maxMaxBufferLength: 300,
    maxBufferSize: 500 * 1000 * 1000,
    maxFragLookUpTolerance: 0,
    // Casa: era 0 (default Stremio) → ogni micro-gap audio ai confini dei
    // frammenti HLS transcodificati (AAC) veniva scambiato per bufferStalledError
    // → stall + nudge di currentTime (~1s di salto). 0.5 = default hls.js: i
    // buchi <0.5s vengono ignorati senza stallare. Fix hickup ET (2026-06-27).
    // Riscontri: hls.js#6169 (audio gap stall), risolto upstream solo in 1.6.0
    // (PR#6972); stremio-video@0.0.80 pinna hls.js 1.5.4-patch2 → serve override.
    maxBufferHole: 0.5,
    appendErrorMaxRetry: 20,
    nudgeMaxRetry: 20,
    manifestLoadingTimeOut: 30000,
    manifestLoadingMaxRetry: 10,
    fragLoadPolicy: {
        default: {
            maxTimeToFirstByteMs: 10000,
            maxLoadTimeMs: 120000,
            timeoutRetry: {
                maxNumRetry: 20,
                retryDelayMs: 0,
                maxRetryDelayMs: 15
            },
            errorRetry: {
                maxNumRetry: 6,
                retryDelayMs: 1000,
                maxRetryDelayMs: 15
            }
        }
    }
    // liveDurationInfinity: false
};
