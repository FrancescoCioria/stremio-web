// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { default: Icon } = require('@stremio/stremio-icons/react');
const { t } = require('i18next');
const { useCore } = require('stremio/core');
const { useProfile, usePlatform, useToast, useBinaryState } = require('stremio/common');
const { Button, Image, Popup } = require('stremio/components');
const { default: useRouteFocused } = require('stremio/common/useRouteFocused');
const StreamPlaceholder = require('./StreamPlaceholder');
const styles = require('./styles');

// Icona "floppy" per indicare il file size (semanticamente piu' chiara di
// memory chip / hard drive). Inlined cosi' non serve pipeline asset.
const SaveIcon = ({ className }) => (
    <svg className={className} viewBox="0 0 488.446 488.446" fill="currentColor" aria-hidden="true">
        <path d="M153.029 90.223h182.404c5.427 0 9.873-4.43 9.873-9.869V0H143.137v80.354c0 5.439 4.434 9.869 9.892 9.869z" />
        <path d="M480.817 122.864 377.88 19.494v60.859c0 23.404-19.043 42.447-42.447 42.447H153.029c-23.409 0-42.447-19.043-42.447-42.447V0H44.823C20.068 0 .002 20.07.002 44.808v398.831c0 24.736 20.066 44.808 44.821 44.808h398.813c24.74 0 44.808-20.068 44.808-44.808V141.325c0-6.933-2.746-13.567-7.627-18.461zM412.461 385.666c0 14.434-11.703 26.154-26.168 26.154H102.137c-14.451 0-26.153-11.722-26.153-26.154V249.303c0-14.43 11.702-26.148 26.153-26.148h284.156c14.465 0 26.168 11.72 26.168 26.148v136.363z" />
        <path d="M356.497 265.131H131.949c-9.008 0-16.294 7.273-16.294 16.28s7.286 16.28 16.294 16.28h224.549c8.988 0 16.277-7.273 16.277-16.28s-7.288-16.28-16.278-16.28z" />
        <path d="M323.936 330.264H164.508c-8.994 0-16.28 7.273-16.28 16.28 0 8.989 7.286 16.28 16.28 16.28h159.427c8.994 0 16.281-7.291 16.281-16.28 0-9.007-7.287-16.28-16.281-16.28z" />
    </svg>
);

const Stream = ({ className, videoId, videoReleased, addonName, name, description, thumbnail, progress, deepLinks, incompatible, health, ...props }) => {
    const profile = useProfile();
    const toast = useToast();
    const platform = usePlatform();
    const core = useCore();
    const routeFocused = useRouteFocused();

    const [menuOpen, , closeMenu, toggleMenu] = useBinaryState(false);

    const popupLabelOnMouseUp = React.useCallback((event) => {
        if (!event.nativeEvent.togglePopupPrevented) {
            if (event.nativeEvent.ctrlKey || event.nativeEvent.button === 2) {
                event.preventDefault();
                toggleMenu();
            }
        }
    }, []);
    const popupLabelOnContextMenu = React.useCallback((event) => {
        if (!event.nativeEvent.togglePopupPrevented && !event.nativeEvent.ctrlKey) {
            event.preventDefault();
        }
    }, [toggleMenu]);
    const popupLabelOnLongPress = React.useCallback((event) => {
        if (event.nativeEvent.pointerType !== 'mouse' && !event.nativeEvent.togglePopupPrevented) {
            toggleMenu();
        }
    }, [toggleMenu]);
    const popupMenuOnPointerDown = React.useCallback((event) => {
        event.nativeEvent.togglePopupPrevented = true;
    }, []);
    const popupMenuOnContextMenu = React.useCallback((event) => {
        event.nativeEvent.togglePopupPrevented = true;
    }, []);
    const popupMenuOnClick = React.useCallback((event) => {
        event.nativeEvent.togglePopupPrevented = true;
    }, []);
    const popupMenuOnKeyDown = React.useCallback((event) => {
        event.nativeEvent.buttonClickPrevented = true;
    }, []);

    // Stream incompatibile (HEVC/10bit): non riproducibile su questo box
    // (Brave/Linux niente HW decode HEVC). Lo mostriamo disabilitato, in fondo
    // alla lista, con badge "Fire TV". Niente href -> nessuna navigazione al
    // player; il click mostra un toast che rimanda alla Fire TV.
    const href = React.useMemo(() => {
        if (incompatible) return null;
        return deepLinks ?
            deepLinks.externalPlayer ?
                deepLinks.externalPlayer.web ?
                    deepLinks.externalPlayer.web
                    :
                    deepLinks.externalPlayer.openPlayer ?
                        deepLinks.externalPlayer.openPlayer[platform.name] ?
                            deepLinks.externalPlayer.openPlayer[platform.name]
                            :
                            deepLinks.externalPlayer.playlist
                        :
                        deepLinks.player
                :
                deepLinks.player
            :
            null;
    }, [deepLinks, incompatible]);

    const download = React.useMemo(() => {
        return href === deepLinks?.externalPlayer?.playlist ?
            deepLinks.externalPlayer.fileName
            :
            null;
    }, [href, deepLinks]);

    const target = React.useMemo(() => {
        return href === deepLinks?.externalPlayer?.web ?
            '_blank'
            :
            null;
    }, [href, deepLinks]);

    const streamLink = React.useMemo(() => {
        return deepLinks?.externalPlayer?.streaming;
    }, [deepLinks]);

    const downloadLink = React.useMemo(() => {
        return deepLinks?.externalPlayer?.download;
    }, [deepLinks]);

    const magnetLink = React.useMemo(() => {
        return deepLinks?.externalPlayer?.magnet;
    }, [deepLinks]);

    const markVideoAsWatched = React.useCallback(() => {
        if (typeof videoId === 'string') {
            core.transport.dispatch({
                action: 'MetaDetails',
                args: {
                    action: 'MarkVideoAsWatched',
                    args: [{ id: videoId, released: videoReleased }, true]
                }
            });
        }
    }, [videoId, videoReleased]);

    const onClick = React.useCallback((event) => {
        if (event.nativeEvent.togglePopupPrevented) {
            return;
        }

        // Incompatibile: niente play. Spiega all'utente di usare la Fire TV.
        if (incompatible) {
            event.preventDefault();
            toast.show({
                type: 'info',
                title: 'Formato HEVC/10bit non supportato qui — guardalo dalla Fire TV',
                timeout: 5000
            });
            return;
        }

        if (profile.settings.playerType !== null) {
            markVideoAsWatched();
            toast.show({
                type: 'success',
                title: 'Stream opened in external player',
                timeout: 4000
            });
        }

        if (typeof props.onClick === 'function') {
            props.onClick(event);
        }
    }, [props.onClick, profile.settings, markVideoAsWatched, incompatible]);

    const copyMagnetLink = React.useCallback((event) => {
        event.preventDefault();
        closeMenu();
        if (magnetLink) {
            navigator.clipboard.writeText(magnetLink)
                .then(() => {
                    toast.show({
                        type: 'success',
                        title: t('PLAYER_COPY_MAGNET_LINK_SUCCESS'),
                        timeout: 4000
                    });
                })
                .catch(() => {
                    toast.show({
                        type: 'error',
                        title: t('PLAYER_COPY_MAGNET_LINK_ERROR'),
                        timeout: 4000,
                    });
                });
        }
    }, [magnetLink]);

    const copyDownloadLink = React.useCallback((event) => {
        event.preventDefault();
        closeMenu();
        if (downloadLink) {
            navigator.clipboard.writeText(downloadLink)
                .then(() => {
                    toast.show({
                        type: 'success',
                        title: t('PLAYER_COPY_DOWNLOAD_LINK_SUCCESS'),
                        timeout: 4000
                    });
                })
                .catch(() => {
                    toast.show({
                        type: 'error',
                        title: t('PLAYER_COPY_DOWNLOAD_LINK_ERROR'),
                        timeout: 4000,
                    });
                });
        }
    }, [downloadLink]);

    const copyStreamLink = React.useCallback((event) => {
        event.preventDefault();
        closeMenu();
        if (streamLink) {
            navigator.clipboard.writeText(streamLink)
                .then(() => {
                    toast.show({
                        type: 'success',
                        title: t('PLAYER_COPY_STREAM_SUCCESS'),
                        timeout: 4000
                    });
                })
                .catch(() => {
                    toast.show({
                        type: 'error',
                        title: t('PLAYER_COPY_STREAM_ERROR'),
                        timeout: 4000,
                    });
                });
        }
    }, [streamLink]);

    const renderThumbnailFallback = React.useCallback(() => (
        <Icon className={styles['placeholder-icon']} name={'ic_broken_link'} />
    ), []);

    // Torrentio (e simili) mettono seed/size nella description con emoji
    // 👤 / 💾. Li estraiamo per mostrarli come meta-badge sotto il badge
    // addon nella colonna sinistra, e li togliamo dalla description al
    // centro (che resta col filename pulito).
    // Source: parsata dal filename (es. AMZN, NF, DSNP, WEB-DL, BluRay...).
    // Priorita' streamer (label brand-aware) -> formato release.
    const { seed, size, source, cleanDescription } = React.useMemo(() => {
        if (typeof description !== 'string') {
            return { seed: null, size: null, source: null, cleanDescription: description };
        }
        const seedMatch = description.match(/👤\s*([\d.,]+)/);
        const sizeMatch = description.match(/💾\s*([\d.,]+\s*(?:GB|MB|TB|KB))/i);
        const haystack = `${typeof name === 'string' ? name : ''} ${description}`;
        const STREAMERS = [
            ['AMZN', 'Amazon'], ['NFLX', 'Netflix'], ['NF', 'Netflix'],
            ['DSNP', 'Disney+'], ['DSNY', 'Disney+'],
            ['HMAX', 'HBO Max'], ['MAX', 'Max'], ['HBO', 'HBO'],
            ['ATVP', 'Apple TV+'], ['APTV', 'Apple TV+'],
            ['HULU', 'Hulu'], ['PCOK', 'Peacock'], ['PMTP', 'Paramount+'],
            ['STAN', 'Stan'], ['CR', 'Crunchyroll'], ['CRAV', 'Crave'],
            ['iT', 'iTunes'], ['RED', 'YT Red'],
        ];
        let src = null;
        for (const [code, label] of STREAMERS) {
            const re = new RegExp(`(?:^|[\\s.\\-_\\[(])${code}(?=[\\s.\\-_\\])])`, 'i');
            if (re.test(haystack)) { src = label; break; }
        }
        if (!src) {
            const formatMatch = haystack.match(/\b(WEB[-.]?DL|WEB[-.]?Rip|WEBRip|BluRay|BDRip|BRRip|HDTV|DVDRip|HDRip|CAM|TS|TC|REMUX)\b/i);
            if (formatMatch) {
                const f = formatMatch[1].toUpperCase().replace(/[.\-]/g, '');
                const FMT_LABEL = { WEBDL: 'WEB-DL', WEBRIP: 'WEBRip', BLURAY: 'BluRay', BDRIP: 'BDRip', BRRIP: 'BRRip', HDTV: 'HDTV', DVDRIP: 'DVDRip', HDRIP: 'HDRip', CAM: 'CAM', TS: 'TS', TC: 'TC', REMUX: 'REMUX' };
                src = FMT_LABEL[f] || formatMatch[1];
            }
        }
        const clean = description
            .split('\n')
            .map((line) => line.replace(/👤\s*[\d.,]+/g, '').replace(/💾\s*[\d.,]+\s*(?:GB|MB|TB|KB)/gi, '').trim())
            .filter((line) => line.length > 0)
            .join('\n');
        return {
            seed: seedMatch ? seedMatch[1] : null,
            size: sizeMatch ? sizeMatch[1] : null,
            source: src,
            cleanDescription: clean,
        };
    }, [description, name]);

    const renderLabel = React.useMemo(() => function renderLabel({ className, children, ...props }) {
        return (
            <Button className={classnames(className, styles['stream-container'], { [styles['incompatible']]: incompatible })} title={incompatible ? 'Solo Fire TV (HEVC/10bit)' : addonName} href={href} target={target} download={download} onClick={onClick} {...props}>
                <div className={styles['info-container']}>
                    {
                        typeof thumbnail === 'string' && thumbnail.length > 0 ?
                            <div className={styles['thumbnail-container']} title={name || addonName}>
                                <Image
                                    className={styles['thumbnail']}
                                    src={thumbnail}
                                    alt={' '}
                                    renderFallback={renderThumbnailFallback}
                                />
                            </div>
                            :
                            <div className={styles['addon-name-container']} title={name || addonName}>
                                <div className={styles['addon-name']}>{name || addonName}</div>
                            </div>
                    }
                    {
                        (size || seed || source) ?
                            <div className={styles['meta-stack']}>
                                {seed ? <div className={styles['meta-item']}><Icon className={styles['meta-icon']} name={'person'} /><span>{seed}</span></div> : null}
                                {size ? <div className={styles['meta-item']}><SaveIcon className={classnames(styles['meta-icon'], styles['meta-icon-save'])} /><span>{size}</span></div> : null}
                                {source ? <div className={styles['meta-item']}>{source}</div> : null}
                            </div>
                            :
                            null
                    }
                    {
                        /* Badge salute torrent (indice di qualita'): MORTO = swarm
                         * spento (niente seeder), RACCOLTA = pack multi-film (il
                         * file e' una fetta minuscola del torrent). Anche spinti
                         * in fondo via streamPriority. */
                        (health === 'dead' || health === 'pack') ?
                            <div
                                className={classnames(styles['health-badge'], health === 'dead' ? styles['health-dead'] : styles['health-pack'])}
                                title={health === 'dead' ? 'Nessun seeder attivo: non scarica' : 'Raccolta multi-film: il file scelto e una fetta minuscola del torrent'}
                            >
                                {health === 'dead' ? 'MORTO' : 'RACCOLTA'}
                            </div>
                            :
                            null
                    }
                    {
                        progress !== null && !isNaN(progress) && progress > 0 ?
                            <div className={styles['progress-bar-container']}>
                                <div className={styles['progress-bar']} style={{ width: `${progress}%` }} />
                                <div className={styles['progress-bar-background']} />
                            </div>
                            :
                            null
                    }
                </div>
                <div className={styles['description-container']} title={cleanDescription}>{cleanDescription}</div>
                {
                    incompatible ?
                        <div className={styles['firetv-badge']} title={'Guardalo dalla Fire TV'}>
                            <Icon className={styles['firetv-icon']} name={'tv-outline'} />
                            <span className={styles['firetv-label']}>{'Fire TV'}</span>
                        </div>
                        :
                        <Icon className={styles['icon']} name={'play'} />
                }
                {children}
            </Button>
        );
    }, [thumbnail, progress, addonName, name, cleanDescription, seed, size, source, href, target, download, onClick, incompatible, health]);

    const renderMenu = React.useMemo(() => function renderMenu() {
        return (
            <div className={styles['context-menu-content']} onPointerDown={popupMenuOnPointerDown} onContextMenu={popupMenuOnContextMenu} onClick={popupMenuOnClick} onKeyDown={popupMenuOnKeyDown}>
                <div className={styles['context-menu-title']}>
                    {description}
                </div>
                <Button className={styles['context-menu-option-container']} title={t('CTX_PLAY')}>
                    <Icon className={styles['menu-icon']} name={'play'} />
                    <div className={styles['context-menu-option-label']}>{t('CTX_PLAY')}</div>
                </Button>
                {
                    streamLink &&
                        <Button className={styles['context-menu-option-container']} title={t('CTX_COPY_STREAM_LINK')} onClick={copyStreamLink}>
                            <Icon className={styles['menu-icon']} name={'link'} />
                            <div className={styles['context-menu-option-label']}>{t('CTX_COPY_STREAM_LINK')}</div>
                        </Button>
                }
                {
                    magnetLink &&
                        <Button className={styles['context-menu-option-container']} title={t('CTX_COPY_MAGNET_LINK')} onClick={copyMagnetLink}>
                            <Icon className={styles['menu-icon']} name={'magnet-link'} />
                            <div className={styles['context-menu-option-label']}>{t('CTX_COPY_MAGNET_LINK')}</div>
                        </Button>
                }
                {
                    downloadLink &&
                        <Button className={styles['context-menu-option-container']} title={t('CTX_DOWNLOAD_VIDEO')} onClick={copyDownloadLink}>
                            <Icon className={styles['menu-icon']} name={'download'} />
                            <div className={styles['context-menu-option-label']}>{t('CTX_COPY_VIDEO_DOWNLOAD_LINK')}</div>
                        </Button>
                }
            </div>
        );
    }, [copyStreamLink, onClick]);

    React.useEffect(() => {
        if (!routeFocused) {
            closeMenu();
        }
    }, [routeFocused]);

    return (
        <Popup
            className={className}
            onMouseUp={popupLabelOnMouseUp}
            onLongPress={popupLabelOnLongPress}
            onContextMenu={popupLabelOnContextMenu}
            open={menuOpen}
            onCloseRequest={closeMenu}
            renderLabel={renderLabel}
            renderMenu={renderMenu}
        />
    );
};

Stream.Placeholder = StreamPlaceholder;

Stream.propTypes = {
    className: PropTypes.string,
    videoId: PropTypes.string,
    videoReleased: PropTypes.instanceOf(Date),
    addonName: PropTypes.string,
    name: PropTypes.string,
    description: PropTypes.string,
    thumbnail: PropTypes.string,
    progress: PropTypes.number,
    incompatible: PropTypes.bool,
    health: PropTypes.string,
    deepLinks: PropTypes.shape({
        player: PropTypes.string,
        externalPlayer: PropTypes.shape({
            download: PropTypes.string,
            magnet: PropTypes.string,
            streaming: PropTypes.string,
            playlist: PropTypes.string,
            fileName: PropTypes.string,
            web: PropTypes.string,
            openPlayer: PropTypes.shape({
                ios: PropTypes.string,
                android: PropTypes.string,
                windows: PropTypes.string,
                macos: PropTypes.string,
                linux: PropTypes.string,
            })
        })
    }),
    onClick: PropTypes.func
};

module.exports = Stream;
