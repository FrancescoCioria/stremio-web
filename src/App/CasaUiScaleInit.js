// Copyright (C) 2017-2026 Smart code 203358507
//
// Applica lo Zoom UI persistito (common/casaUiScale.js) al boot.
//
// useLayoutEffect e non useEffect: deve girare PRIMA che il browser dipinga.
// Il CSS ha gia' un default (--casa-ui-scale: 1.1 in App/styles.less) per il
// primo paint senza JS; se l'utente ha un valore diverso persistito, questo
// lo sovrascrive prima che l'occhio veda il default — altrimenti si vedrebbe
// un flash 110% -> valore-utente a ogni caricamento.

const React = require('react');
const casaUiScale = require('stremio/common/casaUiScale');

const CasaUiScaleInit = () => {
    React.useLayoutEffect(() => {
        casaUiScale.init();
    }, []);

    return null;
};

module.exports = CasaUiScaleInit;
