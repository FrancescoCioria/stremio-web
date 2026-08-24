// Copyright (C) 2017-2026 Smart code 203358507
//
// La riga Continue Watching contiene due popolazioni diverse:
//  - gli item del core (hanno un progresso vero e un libraryItem dietro)
//  - quelli di "Guarda dopo" (nostri, mai iniziati)
//
// ⚠️ Non si possono rendere con lo stesso componente. `ContinueWatchingItem`
// attacca alla card la "X" di dismiss, che dispatcha `RewindLibraryItem` +
// `DismissNotificationItem` su `_id`: sui nostri item quell'id nella library
// NON esiste, quindi il gesto piu' ovvio della card non farebbe nulla — in
// silenzio. Meglio non offrirlo: i nostri usano il menu contestuale
// ("Togli da Guarda dopo"), che passa dal backend giusto.

const React = require('react');
// ⚠️ I due componenti si leggono AL RENDER, non si destrutturano qui.
// `stremio/components` e' un barile ESM e questo modulo finisce dentro il suo
// ciclo: al momento in cui il corpo del file viene eseguito le chiavi del
// barile esistono gia' (34) ma valgono ancora `undefined`, quindi un
// `const { MetaItem } = require(...)` le congela a undefined PER SEMPRE e la
// riga Continue Watching non si monta affatto — React alza "Element type is
// invalid". Letto al render il ciclo e' chiuso da un pezzo e i componenti ci
// sono. Pescato dall'harness Playwright: nessun test unitario lo vedeva.
const components = require('stremio/components');
const { CASA_WATCHLIST } = require('stremio/common/casaWatchlist');

const ContinueWatchingRowItem = (props) => {
    return props[CASA_WATCHLIST] === true ?
        <components.MetaItem {...props} />
        :
        <components.ContinueWatchingItem {...props} />;
};

module.exports = ContinueWatchingRowItem;
