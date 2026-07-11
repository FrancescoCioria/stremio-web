module.exports = {
    debug: false,
    enableWorker: true,
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
