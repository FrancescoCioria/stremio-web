// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { useTranslation } = require('react-i18next');
const { default: Icon } = require('@stremio/stremio-icons/react');
const { Button, Image, MultiselectMenu } = require('stremio/components');
const { useServices } = require('stremio/services');
const Stream = require('./Stream');
const styles = require('./styles');
const { usePlatform, useProfile } = require('stremio/common');
const { default: SeasonEpisodePicker } = require('../EpisodePicker');

const ALL_ADDONS_KEY = 'ALL';

// Codec audio/video che Brave/Chromium NON decodifica in HTML5 video (no
// licenza Dolby, no decoder ProRes/HEVC senza VideoToolbox). Il player
// resta in loading silenzioso senza error toast (Stremio bug 2081-style).
// Filtriamo a monte: la lista mostra solo stream realmente riproducibili.
// Tag matching su name+title+description (gli addon mettono i tag almeno
// in uno dei tre).
const INCOMPATIBLE_CODEC_RE = /\b(?:DDP|DD\+|EAC[-_ .]?3|E-?AC-?3|TrueHD|Atmos|DTS(?:[-_ .]?(?:HD|MA|X))?|HEVC|H[-_ .]?265|x265)\b/i;
const isCompatibleStream = (stream) => {
    const text = [stream.name, stream.title, stream.description].filter(Boolean).join(' ');
    return !INCOMPATIBLE_CODEC_RE.test(text);
};

const StreamsList = ({ className, video, type, onEpisodeSearch, ...props }) => {
    const { t } = useTranslation();
    const { core } = useServices();
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
                const compatible = streams.content.content
                    .filter(isCompatibleStream)
                    .map((stream) => ({
                        ...stream,
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
                // Skip addon che non lascia nessuno stream compatibile:
                // niente pill vuota nella selettiva.
                if (compatible.length === 0) return streamsByAddon;
                streamsByAddon[streams.addon.transportUrl] = {
                    addon: streams.addon,
                    streams: compatible
                };

                return streamsByAddon;
            }, {});
    }, [props.streams]);
    const filteredStreams = React.useMemo(() => {
        return selectedAddon === ALL_ADDONS_KEY ?
            Object.values(streamsByAddon).map(({ streams }) => streams).flat(1)
            :
            streamsByAddon[selectedAddon] ?
                streamsByAddon[selectedAddon].streams
                :
                [];
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
