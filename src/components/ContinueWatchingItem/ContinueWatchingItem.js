// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const LibItem = require('stremio/components/LibItem');

// Casa: niente "X" di dismiss sulla card. Il dismiss upstream azzera il punto
// di ripresa E spegne la notifica dei nuovi episodi: due effetti, uno dei quali
// invisibile, a una pressione sulla home. Scelta dell'utente (2026-09-21): se
// serve si fa dalla pagina dettagli (⋯ -> "Azzera", che
// azzera SOLO il punto di ripresa). Tolto anche dal menu contestuale (LibItem).
const ContinueWatchingItem = ({ _id, notifications, ...props }) => {
    return (
        <LibItem
            {...props}
            _id={_id}
            posterChangeCursor={true}
            notifications={notifications}
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
