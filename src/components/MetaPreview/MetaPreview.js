// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const UrlUtils = require('url');
const { useTranslation } = require('react-i18next');
const { default: Icon } = require('@stremio/stremio-icons/react');
const { default: Button } = require('stremio/components/Button');
const { default: Image } = require('stremio/components/Image');
const { default: ActionsGroup } = require('stremio/components/ActionsGroup');
const ModalDialog = require('stremio/components/ModalDialog');
const SharePrompt = require('stremio/components/SharePrompt');
const CONSTANTS = require('stremio/common/CONSTANTS');
const routesRegexp = require('stremio/common/routesRegexp');
const useBinaryState = require('stremio/common/useBinaryState');
const ActionButton = require('./ActionButton');
const MetaLinks = require('./MetaLinks');
const MetaPreviewPlaceholder = require('./MetaPreviewPlaceholder');
const styles = require('./styles');
const { Ratings } = require('./Ratings');

const ALLOWED_LINK_REDIRECTS = [
    routesRegexp.search.regexp,
    routesRegexp.discover.regexp,
    routesRegexp.metadetails.regexp
];

const MetaPreview = React.forwardRef(({ className, compact, name, logo, background, runtime, releaseInfo, released, description, deepLinks, links, trailerStreams, inLibrary, toggleInLibrary, watched, toggleWatched, ratingInfo, focusedEpisode, hideActions, showWatchedToggle }, ref) => {
    const { t } = useTranslation();
    const [shareModalOpen, openShareModal, closeShareModal] = useBinaryState(false);
    const linksGroups = React.useMemo(() => {
        return Array.isArray(links) ?
            links
                .filter((link) => link && typeof link.category === 'string' && typeof link.url === 'string')
                .reduce((linksGroups, { category, name, url }) => {
                    const { protocol, path, pathname, hostname } = UrlUtils.parse(url);
                    if (category === CONSTANTS.IMDB_LINK_CATEGORY) {
                        if (hostname === 'imdb.com') {
                            linksGroups.set(category, {
                                label: name,
                                href: `https://www.stremio.com/warning#${encodeURIComponent(url)}`
                            });
                        }
                    } else if (category === CONSTANTS.SHARE_LINK_CATEGORY) {
                        linksGroups.set(category, {
                            label: name,
                            href: url
                        });
                    } else {
                        if (protocol === 'stremio:') {
                            if (pathname !== null && ALLOWED_LINK_REDIRECTS.some((regexp) => pathname.match(regexp))) {
                                if (!linksGroups.has(category)) {
                                    linksGroups.set(category, []);
                                }
                                linksGroups.get(category).push({
                                    label: name,
                                    href: `#${path}`
                                });
                            }
                        } else if (typeof hostname === 'string' && hostname.length > 0) {
                            if (!linksGroups.has(category)) {
                                linksGroups.set(category, []);
                            }
                            linksGroups.get(category).push({
                                label: name,
                                href: `https://www.stremio.com/warning#${encodeURIComponent(url)}`
                            });
                        }
                    }

                    return linksGroups;
                }, new Map())
            :
            new Map();
    }, [links]);
    const showHref = React.useMemo(() => {
        return deepLinks ?
            typeof deepLinks.player === 'string' ?
                deepLinks.player
                :
                typeof deepLinks.metaDetailsStreams === 'string' ?
                    deepLinks.metaDetailsStreams
                    :
                    typeof deepLinks.metaDetailsVideos === 'string' ?
                        deepLinks.metaDetailsVideos
                        :
                        null
            :
            null;
    }, [deepLinks]);
    const trailerHref = React.useMemo(() => {
        if (!Array.isArray(trailerStreams) || trailerStreams.length === 0) {
            return null;
        }

        return trailerStreams[0].deepLinks.player;
    }, [trailerStreams]);
    const renderLogoFallback = React.useCallback(() => (
        <div className={styles['logo-placeholder']}>{name}</div>
    ), [name]);
    const metaItemActions = React.useMemo(() => {
        const actions = [
            {
                icon: inLibrary ? 'remove-from-library' : 'add-to-library',
                label: inLibrary ? t('REMOVE_FROM_LIB') : t('ADD_TO_LIB'),
                onClick: typeof toggleInLibrary === 'function' ? toggleInLibrary : null,
            },
        ];
        // Mark-as-watched esposto solo per FILM (dove segna SOLO il
        // film). Per le serie segnerebbe TUTTI gli episodi con una
        // pressione sola — troppo distruttivo da telecomando.
        if (showWatchedToggle && typeof toggleWatched === 'function') {
            actions.push({
                icon: watched ? 'unwatched' : 'watched',
                label: watched ? t('MARK_AS_NON_WATCHED') : t('MARK_AS_WATCHED'),
                onClick: toggleWatched,
            });
        }
        return actions;
    }, [inLibrary, toggleInLibrary, showWatchedToggle, watched, toggleWatched]);
    return (
        <div className={classnames(className, styles['meta-preview-container'], { [styles['compact']]: compact })} ref={ref}>
            {
                typeof background === 'string' && background.length > 0 ?
                    <div className={styles['background-image-layer']}>
                        <Image className={styles['background-image']} src={background} alt={' '} />
                    </div>
                    :
                    null
            }
            <div className={styles['meta-info-container']}>
                {
                    typeof logo === 'string' && logo.length > 0 ?
                        <Image
                            className={styles['logo']}
                            src={logo}
                            alt={' '}
                            title={name}
                            renderFallback={renderLogoFallback}
                        />
                        :
                        renderLogoFallback()
                }
                {
                    focusedEpisode ?
                        /* TV: episodio focus-ato -> "S02E01 · Dec 25, 2024 · Ppang-gwa boggwon"
                         * al posto di "runtime · year · IMDb". Info della serie
                         * torna quando il focus esce dal rail. */
                        <div className={styles['runtime-release-info-container']}>
                            {
                                typeof focusedEpisode.season === 'number' && typeof focusedEpisode.episode === 'number' ?
                                    <div className={styles['runtime-label']}>
                                        S{String(focusedEpisode.season).padStart(2, '0')}E{String(focusedEpisode.episode).padStart(2, '0')}
                                    </div>
                                    :
                                    null
                            }
                            {
                                focusedEpisode.released instanceof Date && !isNaN(focusedEpisode.released.getTime()) ?
                                    <div className={styles['release-info-label']}>
                                        {focusedEpisode.released.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </div>
                                    :
                                    null
                            }
                            {
                                typeof focusedEpisode.title === 'string' && focusedEpisode.title.length > 0 ?
                                    <div className={styles['release-info-label']}>{focusedEpisode.title}</div>
                                    :
                                    null
                            }
                        </div>
                        :
                        (typeof releaseInfo === 'string' && releaseInfo.length > 0) || (released instanceof Date && !isNaN(released.getTime())) || (typeof runtime === 'string' && runtime.length > 0) || linksGroups.has(CONSTANTS.IMDB_LINK_CATEGORY) ?
                            <div className={styles['runtime-release-info-container']}>
                                {
                                    typeof runtime === 'string' && runtime.length > 0 ?
                                        <div className={styles['runtime-label']}>{runtime}</div>
                                        :
                                        null
                                }
                                {
                                    typeof releaseInfo === 'string' && releaseInfo.length > 0 ?
                                        <div className={styles['release-info-label']}>{releaseInfo}</div>
                                        :
                                        released instanceof Date && !isNaN(released.getTime()) ?
                                            <div className={styles['release-info-label']}>{released.getFullYear()}</div>
                                            :
                                            null
                                }
                                {
                                /* TV: rating IMDb resta visibile come info,
                                 * ma non entra nella spatial nav (tabIndex=-1). */
                                    linksGroups.has(CONSTANTS.IMDB_LINK_CATEGORY) ?
                                        <Button
                                            className={styles['imdb-button-container']}
                                            title={linksGroups.get(CONSTANTS.IMDB_LINK_CATEGORY).label}
                                            href={linksGroups.get(CONSTANTS.IMDB_LINK_CATEGORY).href}
                                            target={'_blank'}
                                            tabIndex={-1}
                                        >
                                            <div className={styles['label']}>{linksGroups.get(CONSTANTS.IMDB_LINK_CATEGORY).label}</div>
                                            <Icon className={styles['icon']} name={'imdb'} />
                                        </Button>
                                        :
                                        null
                                }
                            </div>
                            :
                            null
                }
                {
                    compact && typeof description === 'string' && description.length > 0 ?
                        <div className={styles['description-container']}>
                            {description}
                        </div>
                        :
                        null
                }
                {/* TV: rimossi MetaLinks (Genres, Cast, Directors). Sono
                    chips cliccabili che entrano nella spatial nav e
                    rubano il focus senza servire su TV. */}
                {
                    !compact && typeof description === 'string' && description.length > 0 ?
                        <div className={styles['description-container']}>
                            <div className={styles['label-container']}>
                                {t('SUMMARY')}
                            </div>
                            {description}
                        </div>
                        :
                        null
                }
            </div>
            <div className={styles['action-buttons-container']}>
                {/* TV: in "streams mode" (episodio gia' selezionato, torrent
                 *  picker sotto) non mostriamo Trailer + Add to Library —
                 *  l'utente ha gia' scelto l'episodio, le azioni meta-level
                 *  non hanno senso li. hideActions salta tutto il blocco. */}
                {
                    !hideActions && typeof trailerHref === 'string' ?
                        <ActionButton
                            className={styles['action-button']}
                            icon={'trailer'}
                            label={t('TRAILER')}
                            tabIndex={0}
                            href={trailerHref}
                            tooltip={compact}
                        />
                        :
                        null
                }
                {
                    /* TV: ogni action come ActionButton pill stand-alone. */
                    !hideActions && typeof toggleInLibrary === 'function'
                        ? metaItemActions.map((action, i) => (
                            <ActionButton
                                key={i}
                                className={styles['action-button']}
                                icon={action.icon}
                                label={action.label}
                                tabIndex={compact ? -1 : 0}
                                onClick={action.onClick}
                            />
                        ))
                        : null
                }
                {
                    typeof showHref === 'string' && compact ?
                        <ActionButton
                            className={classnames(styles['action-button'], styles['show-button'])}
                            icon={'play'}
                            label={t('SHOW')}
                            tabIndex={0}
                            href={showHref}
                        />
                        :
                        null
                }
                {
                    !compact && ratingInfo !== null ?
                        <Ratings
                            ratingInfo={ratingInfo}
                            className={styles['group-container']}
                        />
                        :
                        null
                }
                {/* TV: rimosso bottone Share (copiare un link non ha senso
                    da telecomando). */}
            </div>
        </div>
    );
});

MetaPreview.Placeholder = MetaPreviewPlaceholder;

MetaPreview.propTypes = {
    className: PropTypes.string,
    compact: PropTypes.bool,
    name: PropTypes.string,
    logo: PropTypes.string,
    background: PropTypes.string,
    runtime: PropTypes.string,
    releaseInfo: PropTypes.string,
    released: PropTypes.instanceOf(Date),
    description: PropTypes.string,
    deepLinks: PropTypes.shape({
        metaDetailsVideos: PropTypes.string,
        metaDetailsStreams: PropTypes.string,
        player: PropTypes.string
    }),
    links: PropTypes.arrayOf(PropTypes.shape({
        category: PropTypes.string,
        name: PropTypes.string,
        url: PropTypes.string
    })),
    trailerStreams: PropTypes.array,
    inLibrary: PropTypes.bool,
    toggleInLibrary: PropTypes.func,
    watched: PropTypes.bool,
    toggleWatched: PropTypes.func,
    ratingInfo: PropTypes.object,
    focusedEpisode: PropTypes.object,
    hideActions: PropTypes.bool,
    showWatchedToggle: PropTypes.bool,
};

module.exports = MetaPreview;
