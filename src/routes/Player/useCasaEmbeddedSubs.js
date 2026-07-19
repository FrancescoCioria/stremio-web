// Casa: fix strutturale dei sottotitoli EMBEDDED che "si spengono a meta' film".
//
// ORIGINE (provata dai log + ffmpeg, 2026-07-17): stremio-server NON estrae i
// sottotitoli embedded in continuo. I suoi due ffmpeg (video+audio) ESCLUDONO i
// sub (`-map -0:s?`); li tira fuori in un chunk one-shot alla selezione/seek e poi
// smette -> il fronte delle cue in-band si congela, hls le consuma, lo schermo
// resta muto. Il "cambia sottotitolo e torna" li rigenera solo perche' ri-lancia
// il chunk. Il watchdog che ri-toggla la subtitle track in hls e' inutile: non fa
// ripartire l'estrazione lato server (provato: 4 repump, fronte fermo).
//
// FIX: il backend estrae l'INTERA traccia in un VTT completo (subrip -> WebVTT,
// cache su disco) e noi la aggiungiamo come sottotitolo ESTERNO `CASA_EMB_<n>`
// (overlay robusto, stesso path OpenSubtitles). Un file per tutto l'episodio ->
// niente chunking, niente congelamento. Misurato su S01E04: 812 cue da 00:14 a
// 40:02, cioe' l'episodio intero in un colpo solo.
//
// ⚠️ PER L'UTENTE E' LO STESSO SOTTOTITOLO. La `CASA_EMB_<n>` non e' una voce di
// menu: e' il backing della `EMBEDDED_<n>`. Il menu ne mostra UNA (vedi
// `casaEmbeddedSubs.js`), e il passaggio dall'una all'altra non si deve vedere.
//
// ⚠️ QUESTO HOOK NON SELEZIONA NIENTE. La v4.31 ci aveva messo uno switch e
// perdeva sempre: l'auto-select di `useSubtitles` rifiora ad ogni cambio di
// `subtitlesTracks` (lista derivata LIVE da `videoElement.textTracks`, che hls.js
// popola progressivamente) e ha l'ultima parola. Log del 2026-07-18: agganciato
// alle 19:01:35, sganciato alle 19:01:39 col playhead a 1.8s. La selezione si
// governa da `useSubtitles`, non da qui.
//
// ⚠️ PREPARAZIONE GUIDATA DALLA DOMANDA — non registrare tutto in anticipo.
// Due motivi, entrambi misurati sul campo il 2026-07-18:
//   1. COSTO. Un file ha anche 37 tracce embedded; preparare tutto = 37 ffmpeg
//      che leggono il container fino all'ultimo pacchetto sub. Si prepara SOLO
//      la traccia che l'utente sta guardando.
//   2. IL BUCO INIZIALE. Registrare la traccia PRIMA che il VTT esista faceva
//      selezionare all'auto-select un file inesistente: su S01E04 (torrent
//      freddo) l'estrazione ha impiegato 59s e per quel minuto NON c'erano
//      sottotitoli affatto — una regressione rispetto all'in-band, che parte
//      subito. Ora la traccia si aggiunge solo QUANDO il VTT e' pronto: fino a
//      quel momento suona l'in-band (che regge ~5 min, ampiamente sufficienti),
//      poi l'upgrade in `useSubtitles` fa il cambio in silenzio.
//
// ⚠️⚠️ IL FETCH RIUSCITO NON SIGNIFICA TRACCIA REGISTRATA — RICONCILIARE, NON
// "SPARARE E SPERARE" (regressione v4.40, provata sul campo il 2026-07-19).
// Serata reale, S01E04: il backend ha servito i VTT (log: `track=0` alle
// 21:14:37, `track=1` alle 21:20:43) ma `video.state.extraSubtitlesTracks` e'
// rimasto a 16 elementi per TUTTA la sessione — la traccia Casa non e' MAI
// entrata nello stato, `sel.extra` e' rimasto `null` per 30 minuti e i sub sono
// morti a 22:23 di film, esattamente come prima del fix. Zero eventi `CASA` in
// tutta la giornata, contro 63 il 17/07 e 28 il 18/07.
//
// Il `dispatch` di `addExtraSubtitlesTracks` puo' essere buttato via a valle
// SENZA ERRORE e senza che nessuno se ne accorga:
//   - `withStreamingServer.js` lo scarta in silenzio se `loadArgs` e' ancora
//     null (comando emesso mentre il player sta caricando: e' proprio il nostro
//     caso, il primo fetch e' un CACHE HIT da 1ms e arriva prima del load —
//     nel log `extraTracks=0` all'istante del fetch);
//   - `withHTMLSubtitles.js` filtra le tracce malformate senza dire quale;
//   - un `unload`/reload successivo AZZERA la lista (visto lo stesso giorno:
//     `extraTracks` 16 -> 0 -> 16 alle 21:23, probabilmente lo stall-watchdog),
//     portandosi via anche una traccia registrata correttamente.
// E il vecchio codice marcava la chiave come "fatta" PRIMA del fetch,
// ripulendola solo nel `.catch`: fetch ok + add perso = chiave marcata per
// sempre, nessun secondo tentativo per tutto l'episodio.
//
// Percio' qui si separano due cose che prima erano una sola:
//   1. PROCURARSI IL VTT — una volta per (stream, traccia), e' l'operazione
//      costosa (ffmpeg, fino a ~1 min a freddo);
//   2. REGISTRARE LA TRACCIA — quante volte serve, finche' non la si vede
//      DAVVERO in `video.state.extraSubtitlesTracks`. La verifica e' sullo
//      stato, non sull'esito della chiamata.

const React = require('react');
const { casaBackendUrl, casaBeacon } = require('stremio/common/casaBackend');
const {
    streamUrlMatchesVideo,
    nextRegistrationAction,
    isCasaTrackPresent,
} = require('stremio/common/casaEmbeddedSubs');

// Solo i NOSTRI stream TorrServer (l'estrazione backend risolve hash+idx dall'url).
const TS_URL_RE = /\/stremio-addon\/ts\//;
const EMBEDDED_RE = /^EMBEDDED_(\d+)$/;

// Riconciliazione: ogni quanto ricontrollare che la traccia sia ancora nello
// stato, e quante volte insistere. Il ricontrollo a tempo serve per il caso
// "scartata in silenzio": lo stato NON cambia, quindi l'effetto non rifiorisce
// da solo e senza timer non ci sarebbe mai un secondo tentativo.
const RECONCILE_MS = 2000;
const MAX_ATTEMPTS = 10;

// Diagnostica: la catena ha piu' punti di uscita e prima erano TUTTI muti — per
// questo il bug e' tornato tre volte e ogni indagine e' ripartita da zero. Ora
// ogni esito lascia una riga in ~/.local/state/stremio-player-debug.log
// (`ev: "casa-subs"`), cosi' si legge quale anello si e' rotto invece di dedurlo.
const report = (reason, extra) => {
    casaBeacon('/debug/player-event', Object.assign({ ev: 'casa-subs', reason }, extra || {}));
};

const useCasaEmbeddedSubs = (video, streamUrl, streamingServerUrl, selectedVideoId) => {
    // Elenco dei sottotitoli embedded del file (dal probe), per stream.
    const [probed, setProbed] = React.useState(null);
    const probedForRef = React.useRef(null);
    // VTT gia' procurati: chiave `${streamUrl}#${idx}` -> url del file pronto.
    // NB: "pronto", non "registrato" — la registrazione la governa l'effetto 3.
    const readyRef = React.useRef(new Map());
    // Fetch in corso o gia' andati a buon fine, per non ripartire ad ogni giro.
    const fetchingRef = React.useRef(new Set());
    // Tentativi di registrazione spesi per chiave (cap anti-loop).
    const attemptsRef = React.useRef(new Map());
    // Bump per risvegliare l'effetto di riconciliazione (un VTT e' diventato
    // pronto, oppure e' scaduto il timer di ricontrollo).
    const [tick, setTick] = React.useState(0);

    // 1) Enumera i sottotitoli embedded. Nessuna registrazione: solo l'elenco.
    React.useEffect(function() {
        if (!streamUrl || !streamingServerUrl) return;
        if (!TS_URL_RE.test(streamUrl)) return; // non e' un nostro stream

        // ⚠️ GUARDIA ANTI-STALE (incidente 2026-07-18, binge E02->E03).
        // Al cambio episodio il core espone per ~1s uno stato incoerente:
        // `selected` e' gia' l'episodio nuovo, `stream.url` e' ancora quello
        // VECCHIO. Misurato allo stesso secondo (21:24:45):
        //     ts            ... se=S1E3   <- il video: episodio giusto
        //     embedded-subs ... -1x2-     <- i sub: episodio PRECEDENTE
        // Senza guardia estraiamo (e mettiamo in CACHE) i sottotitoli
        // dell'episodio sbagliato e ci armiamo su una url che non verra' mai
        // riprodotta -> il lavoro giusto non parte piu' e l'episodio resta
        // sull'in-band rotta per tutta la durata. Si aspetta: l'effetto rifiora
        // appena `streamUrl` si allinea (e' fra le dipendenze).
        if (!streamUrlMatchesVideo(streamUrl, selectedVideoId)) return;

        if (probedForRef.current === streamUrl) return;

        let cancelled = false;
        const base = String(streamingServerUrl).replace(/\/$/, '');
        const probeUrl = base + '/hlsv2/probe?mediaURL=' + encodeURIComponent(streamUrl);

        fetch(probeUrl)
            .then(function(r) { return r.json(); })
            .then(function(probe) {
                if (cancelled) return;
                const subs = (probe && Array.isArray(probe.streams) ? probe.streams : [])
                    .filter(function(s) { return s && s.track === 'subtitle'; });
                probedForRef.current = streamUrl;
                readyRef.current = new Map();
                fetchingRef.current = new Set();
                attemptsRef.current = new Map();
                report('probed', { streamUrl: streamUrl, subs: subs.length });
                setProbed(subs.length > 0 ? { streamUrl: streamUrl, subs: subs } : null);
            })
            .catch(function() {
                // best-effort: senza probe resta il path in-band
                report('probe-failed', { streamUrl: streamUrl });
            });

        return function() { cancelled = true; };
    }, [streamUrl, streamingServerUrl, selectedVideoId]);

    const selectedEmbeddedId = video.state.selectedSubtitlesTrackId;

    // 2) PROCURA il VTT della sola traccia selezionata. Operazione costosa e
    // idempotente: una volta per (stream, traccia). Non registra niente — al
    // massimo dichiara "pronto" e sveglia l'effetto 3.
    React.useEffect(function() {
        if (!probed || probed.streamUrl !== streamUrl) return;
        if (!selectedEmbeddedId) return; // subs off: niente da preparare

        const m = EMBEDDED_RE.exec(String(selectedEmbeddedId));
        if (!m) return;
        const idx = m[1];

        // La traccia embedded selezionata esiste anche fra i sub del container?
        // (gli indici vengono da namespace diversi: vedi casaEmbeddedSubs.js)
        const sub = probed.subs.find(function(s) { return String(s.id) === idx; });
        if (!sub) {
            report('no-probe-match', { idx: idx, selected: String(selectedEmbeddedId) });
            return;
        }

        const key = streamUrl + '#' + idx;
        if (readyRef.current.has(key) || fetchingRef.current.has(key)) return;
        fetchingRef.current.add(key);

        let cancelled = false;
        const url = casaBackendUrl(
            '/stremio-addon/embedded-subs.vtt?media=' + encodeURIComponent(streamUrl) +
            '&track=' + idx);
        if (!url) return;

        // ⚠️ ABORTIRE SUL SERIO, non solo ignorare il risultato. Chiudere la
        // richiesta e' cio' che fa uccidere ffmpeg al backend: senza, cambiando
        // episodio l'estrazione abbandonata continua a scaricare l'intero file
        // (~1,5 GB per 44 KB di sub) rubando banda al film che stai guardando.
        // Serata del 2026-07-19: 3 estrazioni, di cui 2 orfane in parallelo, per
        // UN episodio guardato.
        const ctrl = new AbortController();

        // A freddo puo' metterci ~1 minuto (ffmpeg deve leggere il container fino
        // all'ultimo pacchetto sub, e il torrent e' ancora indietro). Nel
        // frattempo l'utente sta guardando l'in-band: nessun buco.
        const startedAt = Date.now();
        fetch(url, { signal: ctrl.signal })
            .then(function(r) {
                if (!r.ok) throw new Error('vtt non pronto (' + r.status + ')');
                return r.text();
            })
            .then(function(vtt) {
                if (cancelled) return;
                if (!vtt || vtt.indexOf('-->') === -1) throw new Error('vtt vuoto');
                readyRef.current.set(key, {
                    url: url,
                    lang: sub.language || 'und',
                    label: sub.title || sub.language || ('Sub ' + idx),
                    idx: idx,
                });
                report('vtt-ready', { idx: idx, ms: Date.now() - startedAt, bytes: vtt.length });
                setTick(function(t) { return t + 1; }); // sveglia la riconciliazione
            })
            .catch(function(err) {
                // Fallita: si riprova al prossimo giro (es. altro episodio) e
                // intanto l'in-band resta a coprire. Nessun degrado visibile.
                fetchingRef.current.delete(key);
                // Un abort e' voluto (cambio episodio/traccia), non un guasto:
                // loggarlo come fallimento sporcherebbe la diagnosi.
                if (!cancelled) {
                    report('vtt-failed', { idx: idx, err: String(err && err.message || err) });
                }
            });

        return function() {
            cancelled = true;
            ctrl.abort();
            // ⚠️ Liberare la chiave: altrimenti una traccia abbandonata e poi
            // ri-selezionata (l'utente che va su "Italian (SDH)" e torna
            // indietro) resterebbe marcata come "in corso" per sempre, con il
            // suo fetch ormai abortito -> nessuno la riprova piu'.
            fetchingRef.current.delete(key);
        };
    }, [probed, streamUrl, selectedEmbeddedId]);

    // 3) REGISTRA la traccia e RESTA A GUARDIA che ci sia davvero.
    //
    // ⚠️ La condizione di successo e' "la traccia si vede in
    // `video.state.extraSubtitlesTracks`", NON "la chiamata non ha lanciato".
    // Il dispatch puo' essere scartato in silenzio (player non ancora caricato)
    // e un reload successivo puo' azzerare la lista: in entrambi i casi qui si
    // riprova, perche' l'effetto rifiorisce sia sul cambio di stato sia sul
    // timer. Senza questo, un solo add perso = episodio intero senza sottotitoli.
    const extraTracks = video.state.extraSubtitlesTracks;

    React.useEffect(function() {
        if (!probed || probed.streamUrl !== streamUrl) return;
        if (!selectedEmbeddedId) return;

        const m = EMBEDDED_RE.exec(String(selectedEmbeddedId));
        if (!m) return;
        const idx = m[1];
        const key = streamUrl + '#' + idx;

        const ready = readyRef.current.get(key);
        const attempts = attemptsRef.current.get(key) || 0;
        const action = nextRegistrationAction({
            vttReady: !!ready,
            present: isCasaTrackPresent(extraTracks, idx),
            attempts: attempts,
            maxAttempts: MAX_ATTEMPTS,
        });

        if (action === 'wait') return; // VTT non ancora pronto

        if (action === 'registered') {
            // Registrata: il contatore si azzera, cosi' se un reload la porta
            // via ripartiamo con il budget pieno di tentativi.
            if (attempts) {
                report('registered', { idx: idx, attempts: attempts });
                attemptsRef.current.set(key, 0);
            }
            return;
        }

        if (action === 'give-up') {
            if (attempts === MAX_ATTEMPTS) {
                attemptsRef.current.set(key, attempts + 1); // logga una volta sola
                report('give-up', { idx: idx, attempts: attempts });
            }
            return;
        }

        attemptsRef.current.set(key, attempts + 1);

        video.addExtraSubtitlesTracks([{
            // ⚠️ L'INDICE deve combaciare con quello dell'EMBEDDED_<n>
            // che rimpiazza: e' cosi' che il menu le fonde in una voce
            // sola e che l'upgrade sa quale sostituire.
            id: 'CASA_EMB_' + idx,
            url: ready.url,
            lang: ready.lang,
            label: ready.label,
            origin: 'Casa', // richiesto (string) dal filtro di withHTMLSubtitles
            embedded: false, // deve essere falsy: e' un ESTERNO overlay
        }]);
        report('add-dispatched', { idx: idx, attempt: attempts + 1 });

        // Ricontrollo a tempo: se il dispatch e' stato scartato in silenzio lo
        // stato non cambia, quindi questo effetto non rifiorirebbe mai da solo.
        const timer = setTimeout(function() {
            setTick(function(t) { return t + 1; });
        }, RECONCILE_MS);

        return function() { clearTimeout(timer); };
    }, [video, probed, streamUrl, selectedEmbeddedId, extraTracks, tick]);
};

module.exports = useCasaEmbeddedSubs;
