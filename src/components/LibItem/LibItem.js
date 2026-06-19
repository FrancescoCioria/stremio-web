// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const { useNavigate } = require('react-router');
const { default: toPath } = require('stremio-router/toPath');
const PropTypes = require('prop-types');
const { useCore } = require('stremio/core');
const MetaItem = require('stremio/components/MetaItem');
const { t } = require('i18next');

const LibItem = ({ _id, removable, notifications, watched, ...props }) => {
    const navigate = useNavigate();
    const core = useCore();

    const newVideos = React.useMemo(() => {
        const count = notifications.items?.[_id]?.length ?? 0;
        return Math.min(Math.max(count, 0), 99);
    }, [_id, notifications]);

    const options = React.useMemo(() => {
        return [
            { label: 'LIBRARY_PLAY', value: 'play' },
            { label: 'LIBRARY_DETAILS', value: 'details' },
            { label: 'LIBRARY_RESUME_DISMISS', value: 'dismiss' },
            { label: watched ? 'CTX_MARK_UNWATCHED' : 'CTX_MARK_WATCHED', value: 'watched' },
            { label: 'LIBRARY_REMOVE', value: 'remove' },
        ].filter(({ value }) => {
            switch (value) {
                case 'play':
                    return props.deepLinks && typeof props.deepLinks.player === 'string';
                case 'details':
                    return props.deepLinks && (typeof props.deepLinks.metaDetailsVideos === 'string' || typeof props.deepLinks.metaDetailsStreams === 'string');
                case 'watched':
                    return typeof watched !== 'undefined' && props.deepLinks && (typeof props.deepLinks.metaDetailsVideos === 'string' || typeof props.deepLinks.metaDetailsStreams === 'string');
                case 'dismiss':
                    return typeof _id === 'string' && props.progress !== null && !isNaN(props.progress) && props.progress > 0;
                case 'remove':
                    return typeof _id === 'string' && removable;
            }
        }).map((option) => ({
            ...option,
            label: t(option.label)
        }));
    }, [_id, removable, props.progress, props.deepLinks, watched]);

    const optionOnSelect = React.useCallback((event) => {
        if (typeof props.optionOnSelect === 'function') {
            props.optionOnSelect(event);
        }

        if (!event.nativeEvent.optionSelectPrevented) {
            switch (event.value) {
                case 'play': {
                    if (props.deepLinks && typeof props.deepLinks.player === 'string') {
                        navigate(toPath(props.deepLinks.player));
                    }

                    break;
                }
                case 'details': {
                    if (props.deepLinks) {
                        if (typeof props.deepLinks.metaDetailsVideos === 'string') {
                            navigate(toPath(props.deepLinks.metaDetailsVideos));
                        } else if (typeof props.deepLinks.metaDetailsStreams === 'string') {
                            navigate(toPath(props.deepLinks.metaDetailsStreams));
                        }
                    }

                    break;
                }
                case 'watched': {
                    if (typeof _id === 'string') {
                        core.transport.dispatch({
                            action: 'Ctx',
                            args: {
                                action: 'LibraryItemMarkAsWatched',
                                args: {
                                    id: _id,
                                    is_watched: !watched
                                }
                            }
                        });
                    }

                    break;
                }
                case 'dismiss': {
                    if (typeof _id === 'string') {
                        core.transport.dispatch({
                            action: 'Ctx',
                            args: {
                                action: 'RewindLibraryItem',
                                args: _id
                            }
                        });
                        core.transport.dispatch({
                            action: 'Ctx',
                            args: {
                                action: 'DismissNotificationItem',
                                args: _id
                            }
                        });
                    }

                    break;
                }
                case 'remove': {
                    if (typeof _id === 'string') {
                        core.transport.dispatch({
                            action: 'Ctx',
                            args: {
                                action: 'RemoveFromLibrary',
                                args: _id
                            }
                        });
                    }

                    break;
                }
            }
        }
    }, [_id, props.deepLinks, props.optionOnSelect]);

    const onPlayClick = React.useMemo(() => {
        if (props.deepLinks && typeof props.deepLinks.player === 'string') {
            const dl = props.deepLinks;
            return (event) => {
                event.preventDefault();
                // Series: seed history con episodi + streams cosi' back dal
                // player torna a streams -> episodi -> home invece di saltare
                // dritto a home.
                if (typeof dl.metaDetailsVideos === 'string' && typeof dl.metaDetailsStreams === 'string' &&
                    dl.metaDetailsVideos !== dl.metaDetailsStreams) {
                    window.history.pushState(null, '', dl.metaDetailsVideos);
                    window.history.pushState(null, '', dl.metaDetailsStreams);
                }
                window.location = dl.player;
            };
        }
        return null;
    }, [props.deepLinks]);

    // Continue Watching: UX Netflix-like -> click sulla tile parte direttamente
    // il video (deepLinks.player). Seed history con episodi + streams cosi'
    // back: player -> streams -> episodi -> board. Fallback alla pagina
    // streams se player deepLink manca (nuovo episodio mai aperto).
    const onTileClick = React.useCallback((event) => {
        if (typeof props.onClick === 'function') {
            props.onClick(event);
        }
        if (event.defaultPrevented || event.nativeEvent.optionSelectPrevented) {
            return;
        }
        const dl = props.deepLinks;
        if (!dl) return;
        const hasSeries = typeof dl.metaDetailsVideos === 'string' && typeof dl.metaDetailsStreams === 'string' &&
            dl.metaDetailsVideos !== dl.metaDetailsStreams;
        if (typeof dl.player === 'string') {
            event.preventDefault();
            if (hasSeries) {
                window.history.pushState(null, '', dl.metaDetailsVideos);
                window.history.pushState(null, '', dl.metaDetailsStreams);
            } else if (typeof dl.metaDetailsStreams === 'string') {
                window.history.pushState(null, '', dl.metaDetailsStreams);
            }
            window.location = dl.player;
            return;
        }
        if (hasSeries) {
            event.preventDefault();
            window.history.pushState(null, '', dl.metaDetailsVideos);
            window.location = dl.metaDetailsStreams;
        }
    }, [props.onClick, props.deepLinks]);

    return (
        <MetaItem
            {...props}
            watched={watched}
            newVideos={newVideos}
            options={options}
            optionOnSelect={optionOnSelect}
            onPlayClick={onPlayClick}
            onClick={onTileClick}
        />
    );
};

LibItem.propTypes = {
    _id: PropTypes.string,
    removable: PropTypes.bool,
    progress: PropTypes.number,
    notifications: PropTypes.object,
    watched: PropTypes.bool,
    deepLinks: PropTypes.shape({
        metaDetailsVideos: PropTypes.string,
        metaDetailsStreams: PropTypes.string,
        player: PropTypes.string
    }),
    optionOnSelect: PropTypes.func
};

module.exports = LibItem;
