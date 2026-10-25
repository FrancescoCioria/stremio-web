// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: trama di un FILM in italiano sulla sua pagina. La stessa dell'hero
// della home (`common/casaHero.js` -> backend hero.ts, TMDB it-IT sopra
// Cinemeta, movie_tmdb.ts): un posto solo decide la trama di un titolo.
// Le serie la prendono da casaSeriesFill.js (stesso backend, series_tmdb.ts).
// null = non ancora arrivata o senza traduzione: resta quella del core.

const React = require('react');
const { getHero, fetchHero, subscribe } = require('stremio/common/casaHero');

const useCasaMovieDescription = (type, id) => {
    const isMovie = type === 'movie' && typeof id === 'string';
    const hero = React.useSyncExternalStore(subscribe, () => (isMovie ? getHero(type, id) : null));
    React.useEffect(() => {
        if (isMovie) fetchHero(type, id);
    }, [type, id]);
    const d = hero && hero.meta ? hero.meta.description : null;
    return typeof d === 'string' && d.length > 0 ? d : null;
};

module.exports = useCasaMovieDescription;
