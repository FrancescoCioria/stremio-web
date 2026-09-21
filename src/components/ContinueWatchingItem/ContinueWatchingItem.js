// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const { useCore } = require('stremio/core');
const LibItem = require('stremio/components/LibItem');

const ContinueWatchingItem = ({ _id, notifications, ...props }) => {
    const core = useCore();

    // Casa: la X della card = "Azzera" = SOLO RewindLibraryItem (punto di ripresa a zero, la card
    // esce da Continue Watching). Upstream il dismiss spegneva anche la notifica
    // dei nuovi episodi (DismissNotificationItem): effetto invisibile e non
    // richiesto, tolto su richiesta dell'utente (2026-09-21) — le notifiche si
    // gestiscono dalla pagina dettagli.
    const onDismissClick = React.useCallback((event) => {
        event.preventDefault();
        if (typeof _id === 'string') {
            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'RewindLibraryItem',
                    args: _id
                }
            });
        }
    }, [_id]);

    return (
        <LibItem
            {...props}
            _id={_id}
            posterChangeCursor={true}
            notifications={notifications}
            onDismissClick={onDismissClick}
        />
    );
};

ContinueWatchingItem.propTypes = {
    _id: PropTypes.string,
    notifications: PropTypes.object,
    deepLinks: PropTypes.shape({
        metaDetailsVideos: PropTypes.string,
        metaDetailsStreams: PropTypes.string,
        player: PropTypes.string
    }),
};

module.exports = ContinueWatchingItem;
