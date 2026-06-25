// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { useTranslation } = require('react-i18next');
const { default: Icon } = require('@stremio/stremio-icons/react');
const { Button, Image } = require('stremio/components');
const { useCore } = require('stremio/core');
const Stream = require('./Stream');
const styles = require('./styles');
const { usePlatform, useProfile } = require('stremio/common');
const { streamKey, recallStreamKey } = require('stremio/common/lastStream');
const { default: SeasonEpisodePicker } = require('../EpisodePicker');

const ALL_ADDONS_KEY = 'ALL';

// Codec VIDEO incompatibili (HEVC/x265/10-bit).
// Su CachyOS lo Stremio Server transcodifica solo l'AUDIO (eac3/DDP/DTS -> AAC,
// verificato: ffmpeg `-c:a aac`), ma il VIDEO lo passa grezzo (`-c:v copy`).
// Brave su Linux non ha HW decode HEVC affidabile (Wayland/VAAPI 680M cade in
// software) -> HEVC Main10 1080p in software decode non regge il realtime ->
// freeze continui + loop di re-seek lato server.
// Incidente 2026-06-15: "Omaha 2025 1080p WEBRip 10Bit DDP x265" -> ffprobe
// hevc Main10 yuv420p10le -> blocchi continui. Vedi project_stremio_codec_filter.
//
// NON nascondiamo piu' questi stream (prima li filtravamo via): se un film ha
// SOLO release HEVC/10bit, l'utente restava senza nulla anche se quei torrent
// girano bene sulla Fire TV (HW decode HEVC nativo). Ora li teniamo, marcati
// `incompatible`: vengono mostrati DISABILITATI, IN FONDO alla lista, con un
// badge "Fire TV" che invita a guardarli da li'. Cosi' il fallback resta
// visibile invece di sparire silenziosamente.
const FILTER_INCOMPATIBLE_CODECS = true;
const INCOMPATIBLE_CODEC_RE = /\b(?:x[\s._-]?265|h[\s._-]?265|HEVC|10[\s._-]?bit)\b/i;
// Firefox (Gecko) su Linux HW-decoda HEVC/10bit via VAAPI -> NON filtrare.
// Brave/Chromium cade in software decode -> filtra. Stesso build, due browser.
const IS_FIREFOX = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);

const isIncompatibleStream = (stream) => {
    if (!FILTER_INCOMPATIBLE_CODECS || IS_FIREFOX) return false;
    // I token codec (x265/10bit) spesso NON sono in name/title/description (che
    // l'addon mostra "puliti", es. YTS: "2160p" e basta) ma nel filename reale.
    // Verificato 2026-06-20: "Wake.Up.Dead.Man...2160p.4K.WEB.x265.10bit...mkv"
    // (HEVC Main10, ffprobe) sgusciava il filtro perche' guardavamo solo il
    // titolo. behaviorHints.filename/bingeGroup portano il nome vero del file.
    const bh = stream.behaviorHints || {};
    const text = [stream.name, stream.title, stream.description, bh.filename, bh.bingeGroup].filter(Boolean).join(' ');
    return INCOMPATIBLE_CODEC_RE.test(text);
};

// Risoluzione dal testo (name/title/filename/bingeGroup): max "NNNp" trovato,
// oppure 2160 per 4k/uhd. 0 = sconosciuta (NON penalizzata).
const RES_RE = /(\d{3,4})\s*p\b/gi;
const streamHeight = (stream) => {
    const bh = stream.behaviorHints || {};
    const text = [stream.name, stream.title, stream.description, bh.filename, bh.bingeGroup].filter(Boolean).join(' ');
    let h = 0, m;
    RES_RE.lastIndex = 0;
    while ((m = RES_RE.exec(text)) !== null) { const v = +m[1]; if (v > h) h = v; }
    if (h === 0 && /\b(?:4k|uhd|2160)\b/i.test(text)) h = 2160;
    return h;
};
// "Bassa risoluzione" = 720p e sotto (ma >0: la sconosciuta resta in alto).
const isLowRes = (stream) => { const h = streamHeight(stream); return h > 0 && h <= 720; };
// Etichetta qualita' (da streamHeight, non dal name dell'addon che e' incoerente:
// es. Ytztvio non mette il proprio nome). 2160->"4K", senno' "{h}p", 0->"".
const qualityLabel = (stream) => { const h = streamHeight(stream); return h >= 2160 ? '4K' : (h > 0 ? h + 'p' : ''); };
// Pack dal NOME (deterministico, istantaneo): firme inequivocabili di raccolta
// multi-film. Complementa il rilevamento da contenuto del sidecar (in OR), utile
// quando i metadata non si recuperano (swarm sparso) e il pack restava "ballerino".
// Conservativo per evitare falsi positivi: "REPACK" non matcha (\bpack\b), niente
// "collection"/"saga" (compaiono in titoli di film singoli).
const PACK_NAME_RE = /\bpack\b|\bbox[\s.\-_]?set\b|\b\d{1,3}\s*movies?\b|\bfilms?\s*\d{1,3}\b/i;
const isPackByName = (stream) => {
    const bh = stream.behaviorHints || {};
    const text = [stream.name, stream.title, stream.description, bh.filename, bh.bingeGroup].filter(Boolean).join(' ');
    return PACK_NAME_RE.test(text);
};

// Ordine a 3 livelli (sort stabile su V8 -> preserva l'ordine addon/peers
// dentro ogni gruppo):
//   0 = compatibile hi-res (>=1080p o sconosciuta)
//   1 = compatibile bassa risoluzione (<=720p)  -> deprioritizzata anche con tante peers
//   2 = incompatibile (HEVC/10bit, Fire TV-only) -> in fondo, disabilitata
// --- Indice di qualita' stream (sidecar stremio-health, porta 11480) ---
// Sonda i torrent SENZA scaricarli: recupera solo i metadata (aria2) e
// classifica dead (swarm spento, niente metadata) / pack (raccolta multi-film:
// il file scelto e' una fetta minuscola del torrent, ratio<0.9) / clean.
// I dead/pack finiscono in fondo con un badge. Fail-open TOTALE: sidecar giu'
// o errore -> healthMap vuota -> nessuna penalita', nessun blocco play.
// Perche': per film vecchi lo stream "piu' seedato" e' spesso una raccolta da
// 100GB morta; la UI mostra la size del FILE (es. 1.79GB) non del torrent ->
// impossibile distinguerlo a occhio. Vedi project_stremio_slow_dl_dead_packs.
const STREAM_HEALTH_ENABLED = true;
const HEALTH_URL = 'http://127.0.0.1:11480/health';
const HEALTH_MAX = 30; // cap infohash sondati per lista
// Tier salute (i VERIFICATI buoni stanno sopra ai "in verifica"):
//   0 = clean verificato (o unknown/non-torrent: fail-open)
//   1 = verifica in corso (health non ancora risolto)  -> sotto i clean
//   2 = pack    3 = morto
// streamPriority = healthRank*10 + tier risoluzione (0-2) -> nessun overlap.
const healthRank = (s) => s.health === 'dead' ? 3 : (s.health === 'pack' || s.packByName) ? 2 : (s.healthChecking ? 1 : 0);
const streamPriority = (s) => healthRank(s) * 10 + (s.incompatible ? 2 : (s.lowRes ? 1 : 0));
// Seeder dichiarati dall'addon (👤 N nella description), per ordinare A PARITA'
// di tier. Numero potenzialmente stale, ma tra gli stream clean (verificati vivi
// dall'indice salute) e' un ranking ragionevole; la salute resta primaria.
const SEED_RE = /\u{1F464}\s*([\d.,]+)/u;
const parseSeeders = (stream) => {
    const text = [stream && stream.description, stream && stream.title, stream && stream.name].filter(Boolean).join(' ');
    const m = text.match(SEED_RE);
    return m ? (parseInt(m[1].replace(/[.,]/g, ''), 10) || 0) : 0;
};
const seedOf = (s) => (typeof s.seeders === 'number' ? s.seeders : 0);
const byPriority = (streams) =>
    streams.slice().sort((a, b) => (streamPriority(a) - streamPriority(b)) || (seedOf(b) - seedOf(a)));

const StreamsList = ({ className, video, type, onEpisodeSearch, ...props }) => {
    const { t } = useTranslation();
    const core = useCore();
    const platform = usePlatform();
    const profile = useProfile();
    const streamsContainerRef = React.useRef(null);
    const [selectedAddon, setSelectedAddon] = React.useState(ALL_ADDONS_KEY);
    // infoHash(lower) -> 'clean'|'pack'|'dead' dal sidecar di salute.
    const [healthMap, setHealthMap] = React.useState({});
    const healthRequestedRef = React.useRef(new Set());
    const healthMountedRef = React.useRef(true);
    React.useEffect(() => () => { healthMountedRef.current = false; }, []);
    const onAddonSelected = React.useCallback((value) => {
        streamsContainerRef.current.scrollTo({ top: 0, left: 0, behavior: platform.name === 'ios' ? 'smooth' : 'instant' });
        setSelectedAddon(value);
    }, [platform]);
    const showInstallAddonsButton = React.useMemo(() => {
        return !profile || profile.auth === null || profile.auth?.user?.isNewUser === true && !video?.upcoming;
    }, [profile, video]);
    const countLoadingAddons = React.useMemo(() => {
        return props.streams.filter((stream) => stream.content.type === 'Loading').length;
    }, [props.streams]);
    const streamsByAddon = React.useMemo(() => {
        return props.streams
            .filter((streams) => streams.content.type === 'Ready')
            .reduce((streamsByAddon, streams) => {
                const mapped = streams.content.content
                    .map((stream) => ({
                        ...stream,
                        // Stream HEVC/10bit: non riproducibile qui, solo Fire TV.
                        incompatible: isIncompatibleStream(stream),
                        // 720p e sotto: deprioritizzato nel sort (anche con tante peers).
                        lowRes: isLowRes(stream),
                        // Seeder dichiarati: ordina a parita' di tier di salute.
                        seeders: parseSeeders(stream),
                        // Qualita' coerente (calcolata da noi, non dal name addon).
                        quality: qualityLabel(stream),
                        // Pack riconosciuto dal nome (istantaneo, in OR col contenuto).
                        packByName: isPackByName(stream),
                        // Salute torrent dal sidecar (dead/pack -> in fondo + badge).
                        health: typeof stream.infoHash === 'string' ? healthMap[stream.infoHash.toLowerCase()] : undefined,
                        // true finche' il sidecar non ha risposto per questo torrent -> badge "verifico".
                        healthChecking: STREAM_HEALTH_ENABLED && typeof stream.infoHash === 'string' && healthMap[stream.infoHash.toLowerCase()] === undefined,
                        onClick: () => {
                            core.transport.analytics({
                                event: 'StreamClicked',
                                args: {
                                    stream
                                }
                            });
                        },
                        addonName: streams.addon.manifest.name
                    }));
                if (mapped.length === 0) return streamsByAddon;
                streamsByAddon[streams.addon.transportUrl] = {
                    addon: streams.addon,
                    streams: byPriority(mapped)
                };

                return streamsByAddon;
            }, {});
    }, [props.streams, healthMap]);
    const filteredStreams = React.useMemo(() => {
        const list = selectedAddon === ALL_ADDONS_KEY ?
            // Flatten di piu' addon: ogni gruppo e' gia' ordinato, ma la
            // concatenazione interleava -> ri-ordina cosi' su TUTTA la lista
            // unica valgono i 3 livelli (hi-res -> <=720p -> HEVC in fondo).
            byPriority(Object.values(streamsByAddon).map(({ streams }) => streams).flat(1))
            :
            streamsByAddon[selectedAddon] ?
                streamsByAddon[selectedAddon].streams
                :
                [];
        return list;
    }, [streamsByAddon, selectedAddon]);
    // Indice di qualita': raccogli gli infohash unici degli stream Ready e
    // sondali via sidecar stremio-health (solo metadata, niente download).
    // requestedRef evita ri-sonde; fail-open su qualsiasi errore.
    React.useEffect(() => {
        if (!STREAM_HEALTH_ENABLED) return;
        const items = [];
        const seen = new Set();
        for (const streams of props.streams) {
            if (streams.content.type !== 'Ready') continue;
            for (const s of streams.content.content) {
                const ih = typeof s.infoHash === 'string' ? s.infoHash.toLowerCase() : null;
                if (!ih || seen.has(ih)) continue;
                seen.add(ih);
                if (healthRequestedRef.current.has(ih)) continue;
                // tracker veri dello stream (da sources: ["tracker:udp://...", "dht:..."])
                const trackers = Array.isArray(s.sources)
                    ? s.sources.filter((x) => typeof x === 'string' && x.indexOf('tracker:') === 0).map((x) => x.slice(8))
                    : undefined;
                items.push({ infoHash: ih, fileIdx: s.fileIdx != null ? s.fileIdx : null, trackers });
                if (items.length >= HEALTH_MAX) break;
            }
            if (items.length >= HEALTH_MAX) break;
        }
        if (items.length === 0) return;
        items.forEach((it) => healthRequestedRef.current.add(it.infoHash));
        // UNA richiesta PER torrent (non un unico batch): cosi' ogni badge si
        // risolve per conto suo e compare appena pronto (i vivi in ~3s) invece di
        // aspettare che ANCHE il piu' lento/morto finisca (~20s), come faceva il
        // batch unico. setHealthMap incrementale -> la lista si riordina mano a
        // mano. A fine richiesta l'hash ha un verdetto o 'unknown' (spegne il
        // "verifico" anche se il sidecar e' giu'). NIENTE cancellazione per-run.
        const setOne = (ih, status) => {
            if (healthMountedRef.current) setHealthMap((prev) => (prev[ih] === status ? prev : Object.assign({}, prev, { [ih]: status })));
        };
        items.forEach((it) => {
            fetch(HEALTH_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [it] }) })
                .then((r) => r.ok ? r.json() : null)
                .then((arr) => { const r = Array.isArray(arr) ? arr[0] : null; setOne(it.infoHash, (r && r.status) || 'unknown'); })
                .catch(() => setOne(it.infoHash, 'unknown'));
        });
    }, [props.streams]);

    const selectableOptions = React.useMemo(() => {
        return {
            options: [
                {
                    value: ALL_ADDONS_KEY,
                    label: t('ALL_ADDONS'),
                    title: t('ALL_ADDONS')
                },
                ...Object.keys(streamsByAddon).map((transportUrl) => ({
                    value: transportUrl,
                    label: streamsByAddon[transportUrl].addon.manifest.name,
                    title: streamsByAddon[transportUrl].addon.manifest.name,
                }))
            ],
            value: selectedAddon,
            onSelect: onAddonSelected
        };
    }, [streamsByAddon, selectedAddon]);

    const handleEpisodePicker = React.useCallback((season, episode) => {
        onEpisodeSearch(season, episode);
    }, [onEpisodeSearch]);

    // TV: navigazione orizzontale frecce dentro la lista stream. La spatial
    // nav di default si basa sulla visibilita' viewport-clipped quindi
    // arrivati all'ultima card visibile, premere → non passava alla
    // successiva (off-screen). Qui forziamo il next/prev sibling +
    // scrollIntoView in modo deterministico, indipendente dal layout.
    const onStreamsKeyDown = React.useCallback((event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        const target = event.target;
        // Solo se il focus e' su una card stream (figlio diretto del
        // container scrollabile o suo discendente). Lascia stare gli
        // input/textarea o altri elementi che gestiscono le frecce.
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        const container = streamsContainerRef.current;
        if (!container) return;
        // Trova la card "stream" antenata diretta del container.
        let card = target;
        while (card && card.parentElement !== container) card = card.parentElement;
        if (!card) return;
        const sibling = event.key === 'ArrowRight'
            ? card.nextElementSibling
            : card.previousElementSibling;
        if (!sibling) return;
        // Cerca il primo elemento focusable dentro la card sibling.
        const focusable = sibling.matches('a,button,[tabindex]')
            ? sibling
            : sibling.querySelector('a,button,[tabindex]');
        if (!focusable) return;
        event.preventDefault();
        event.stopPropagation();
        focusable.focus({ preventScroll: false });
        // Su key-repeat continuo (telecomando) lo smooth scroll accumula
        // animazioni e fa sentire la nav pesante: instant durante repeat.
        sibling.scrollIntoView({
            behavior: event.repeat ? 'auto' : 'smooth',
            block: 'nearest',
            inline: 'center',
        });
    }, []);

    // Chiave dell'ultimo stream riprodotto per QUESTO video (se si rientra qui
    // tornando indietro dal player): serve a preselezionare la card corrente.
    const wantStreamKeyRef = React.useRef(null);
    React.useEffect(() => {
        wantStreamKeyRef.current = recallStreamKey(video?.id);
    }, [video?.id]);

    // Trova l'elemento focusable della card stream all'indice idx (le card sono
    // figli diretti del container, nello stesso ordine di filteredStreams).
    const focusableAt = React.useCallback((container, idx) => {
        const card = idx >= 0 ? container.children[idx] : null;
        if (!card) return null;
        return card.matches('a,button,[tabindex]') ? card : card.querySelector('a,button,[tabindex]');
    }, []);

    // Default focus: al primo load della lista stream, porta il focus sulla
    // card del torrent che stavi guardando (preselezione al ritorno dal
    // player), altrimenti sulla prima card. Evita all'utente da telecomando di
    // dover scrollare per "trovare" il punto di partenza. Ma se l'utente sta
    // gia' scorrendo le addon-pills (filtraggio live al focus) NON rubare il
    // focus.
    // Focus al ritorno dal player + tenuta del focus attraverso i re-sort async
    // (i verdetti salute rimescolano l'ordine E rimontano le card -> il focus di
    // React non sopravvive). Strategia: RI-ASSERIRE il focus sulla card voluta ad
    // ogni cambio, SENZA azzerare la chiave, finche' l'utente non si sposta su
    // un'altra card (allora molliamo). Senza wantKey: focus iniziale 1a card, poi
    // tieni in vista la card che l'utente sta navigando.
    const initialFocusDoneRef = React.useRef(false);
    React.useEffect(() => {
        const container = streamsContainerRef.current;
        if (!container || filteredStreams.length === 0) return;
        const ae = document.activeElement;
        if (ae && ae.closest && ae.closest('[class*="addon-pill"]')) return; // sui filtri addon: non rubare
        const focusInList = !!(ae && ae !== document.body && container.contains(ae));
        const wantKey = wantStreamKeyRef.current;

        if (wantKey) {
            const idx = filteredStreams.findIndex((s) => streamKey(s) === wantKey);
            if (idx < 0) return; // il torrent voluto non e' (ancora) in lista: riprova al prossimo cambio
            const target = focusableAt(container, idx);
            if (!target) return;
            if (focusInList && ae !== target) {
                wantStreamKeyRef.current = null; // l'utente si e' spostato altrove -> molla
            } else {
                target.focus({ preventScroll: true }); // ri-asserisci (focus perso da remount, o conferma)
                if (!focusInList) target.scrollIntoView({ block: 'center' }); // porta in vista solo se era perso
            }
            initialFocusDoneRef.current = true;
            return;
        }

        if (!initialFocusDoneRef.current && !focusInList) {
            initialFocusDoneRef.current = true;
            const el = container.querySelector('[tabindex], a, button');
            if (el) el.focus();
        } else if (focusInList) {
            ae.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' }); // tieni in vista durante i re-sort
        }
    }, [filteredStreams, focusableAt]);

    return (
        <div className={classnames(className, styles['streams-list-container'])}>
            <div className={styles['select-choices-wrapper']}>
                {
                    /* TV: mostra le pills sempre che ci sia almeno un
                     * addon — coerenza col pattern Android TV (stesse
                     * pills anche con singolo addon). */
                    Object.keys(streamsByAddon).length >= 1 ?
                        <div className={styles['addon-pills']}>
                            {selectableOptions.options.map((opt) => (
                                <Button
                                    key={opt.value}
                                    className={classnames(styles['addon-pill'], { [styles['selected']]: opt.value === selectedAddon })}
                                    onClick={() => onAddonSelected(opt.value)}
                                    onFocus={() => onAddonSelected(opt.value)}
                                >
                                    <div className={styles['label']}>{opt.label}</div>
                                </Button>
                            ))}
                        </div>
                        :
                        null
                }
            </div>
            {
                props.streams.length === 0 ?
                    <div className={styles['message-container']}>
                        {
                            type === 'series' ?
                                <SeasonEpisodePicker className={styles['search']} onSubmit={handleEpisodePicker} />
                                : null
                        }
                        <Image className={styles['image']} src={require('/assets/images/empty.png')} alt={' '} />
                        <div className={styles['label']}>{t('ERR_NO_ADDONS_FOR_STREAMS')}</div>
                    </div>
                    :
                    props.streams.every((streams) => streams.content.type === 'Err') ?
                        <div className={styles['message-container']}>
                            {
                                type === 'series' ?
                                    <SeasonEpisodePicker className={styles['search']} onSubmit={handleEpisodePicker} />
                                    : null
                            }
                            {
                                video?.upcoming ?
                                    <div className={styles['label']}>{t('UPCOMING')}...</div>
                                    : null
                            }
                            <Image className={styles['image']} src={require('/assets/images/empty.png')} alt={' '} />
                            <div className={styles['label']}>{t('NO_STREAM')}</div>
                            {
                                showInstallAddonsButton ?
                                    <Button className={styles['install-button-container']} title={t('ADDON_CATALOGUE_MORE')} href={'#/addons'}>
                                        <Icon className={styles['icon']} name={'addons'} />
                                        <div className={styles['label']}>{t('ADDON_CATALOGUE_MORE')}</div>
                                    </Button>
                                    :
                                    null
                            }
                        </div>
                        :
                        filteredStreams.length === 0 ?
                            <div className={styles['streams-container']}>
                                <Stream.Placeholder />
                                <Stream.Placeholder />
                            </div>
                            :
                            <React.Fragment>
                                <div className={styles['streams-container']} ref={streamsContainerRef} onKeyDown={onStreamsKeyDown}>
                                    {filteredStreams.map((stream, index) => (
                                        <Stream
                                            /* key STABILE per identita' del torrent (non l'indice):
                                             * la lista si ri-ordina async coi verdetti salute -> con
                                             * key=index React legherebbe il focus alla posizione e al
                                             * ritorno dal player il focus finiva sul torrent sbagliato.
                                             * Con key stabile React sposta il nodo col suo dato e il
                                             * focus segue il torrent giusto. */
                                            key={[stream.infoHash || stream.url || stream.name || index, stream.fileIdx, stream.addonName].join('|')}
                                            videoId={video?.id}
                                            videoReleased={video?.released}
                                            addonName={stream.addonName}
                                            quality={stream.quality}
                                            name={stream.name}
                                            description={stream.description}
                                            thumbnail={stream.thumbnail}
                                            progress={stream.progress}
                                            deepLinks={stream.deepLinks}
                                            incompatible={stream.incompatible}
                                            health={stream.health}
                                            healthChecking={stream.healthChecking}
                                            packByName={stream.packByName}
                                            onClick={stream.onClick}
                                        />
                                    ))}
                                    {
                                        showInstallAddonsButton ?
                                            <Button className={styles['install-button-container']} title={t('ADDON_CATALOGUE_MORE')} href={'#/addons'}>
                                                <Icon className={styles['icon']} name={'addons'} />
                                                <div className={styles['label']}>{t('ADDON_CATALOGUE_MORE')}</div>
                                            </Button>
                                            :
                                            null
                                    }
                                </div>
                                {
                                    countLoadingAddons > 0 ?
                                        <div className={styles['addons-loading-container']}>
                                            <div className={styles['addons-loading']}>
                                                {countLoadingAddons} {t('MOBILE_ADDONS_LOADING')}
                                            </div>
                                            <span className={styles['addons-loading-bar']}></span>
                                        </div>
                                        :
                                        null
                                }
                            </React.Fragment>
            }
        </div>
    );
};

StreamsList.propTypes = {
    className: PropTypes.string,
    streams: PropTypes.arrayOf(PropTypes.object).isRequired,
    video: PropTypes.object,
    type: PropTypes.string,
    onEpisodeSearch: PropTypes.func
};

module.exports = StreamsList;
