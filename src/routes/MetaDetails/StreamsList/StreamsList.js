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

// Ordine a 3 livelli (sort stabile su V8 -> preserva l'ordine addon/peers
// dentro ogni gruppo):
//   0 = compatibile hi-res (>=1080p o sconosciuta)
//   1 = compatibile bassa risoluzione (<=720p)  -> deprioritizzata anche con tante peers
//   2 = incompatibile (HEVC/10bit, Fire TV-only) -> in fondo, disabilitata
const streamPriority = (s) => s.incompatible ? 2 : (s.lowRes ? 1 : 0);
const byPriority = (streams) =>
    streams.slice().sort((a, b) => streamPriority(a) - streamPriority(b));

const StreamsList = ({ className, video, type, onEpisodeSearch, ...props }) => {
    const { t } = useTranslation();
    const core = useCore();
    const platform = usePlatform();
    const profile = useProfile();
    const streamsContainerRef = React.useRef(null);
    const [selectedAddon, setSelectedAddon] = React.useState(ALL_ADDONS_KEY);
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
    }, [props.streams]);
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

    // Default focus: al primo load della lista stream, porta il focus sulla
    // prima card. Evita all'utente da telecomando di dover scrollare per
    // "trovare" il punto di partenza. Ma se l'utente sta gia' scorrendo
    // le addon-pills (filtraggio live al focus) NON rubare il focus.
    const initialFocusDoneRef = React.useRef(false);
    React.useEffect(() => {
        if (initialFocusDoneRef.current) return;
        const container = streamsContainerRef.current;
        if (!container || filteredStreams.length === 0) return;
        const ae = document.activeElement;
        const onAddonPill = ae && ae.closest && ae.closest('[class*="addon-pill"]');
        if (onAddonPill) return;
        initialFocusDoneRef.current = true;
        const el = container.querySelector('[tabindex], a, button');
        if (el) el.focus();
    }, [filteredStreams]);

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
                                            key={index}
                                            videoId={video?.id}
                                            videoReleased={video?.released}
                                            addonName={stream.addonName}
                                            name={stream.name}
                                            description={stream.description}
                                            thumbnail={stream.thumbnail}
                                            progress={stream.progress}
                                            deepLinks={stream.deepLinks}
                                            incompatible={stream.incompatible}
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
