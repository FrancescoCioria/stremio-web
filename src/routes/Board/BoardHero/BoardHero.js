// Copyright (C) 2024 — Casa TV fork
// Hero top della Board che mostra info dell'item FOCUSATO nelle rail.
// Ispirato dal layout Android TV: titolo grande left, background-art right,
// runtime/year/rating, genres, description, cast. Niente pulsanti (sono su
// MetaDetails quando cliccato).

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { t } = require('i18next');
const { Image } = require('stremio/components');
const LetterboxdMark = require('stremio/common/LetterboxdMark');
const ImdbMark = require('stremio/common/ImdbMark');
const { NONE: NO_RATINGS } = require('stremio/common/useLetterboxdRating');
const { NONE: NO_AVAILABILITY } = require('stremio/common/useTitleAvailability');
const { getHero, fetchHero, subscribe, keyOf } = require('stremio/common/casaHero');
const styles = require('./styles');

// Tutto cio' che l'hero mostra di un titolo, dal backend (`common/casaHero.js`):
// all'apertura della home arriva in blocco per tutte le righe, quindi al focus
// c'e' gia'. Se l'utente arriva su una card prima del blocco (o su un titolo
// che il blocco non ha portato), si chiede quel titolo da solo.
// ⚠️ L'hero si legge dallo store (`useSyncExternalStore`), non da uno stato
// copiato in un effect: copiato, per un frame avrebbe mostrato i dati del
// titolo precedente sopra il nome di quello nuovo.
const useCasaHero = (rawMeta) => {
    const type = rawMeta ? rawMeta.type : null;
    const id = rawMeta ? (rawMeta.id || rawMeta._id) : null;
    const key = keyOf(type, id);
    const hero = React.useSyncExternalStore(subscribe, () => getHero(type, id));
    // `settledKey`: la richiesta per QUESTO titolo e' finita (anche male).
    // Distingue "in arrivo" da "non c'e'": durante l'arrivo non si mostra il
    // titolo in testo, che il logo sostituirebbe un attimo dopo (flicker).
    const [settledKey, setSettledKey] = React.useState(null);
    React.useEffect(() => {
        // null = fresco gia' in mano: niente richiesta, niente render in piu'.
        // Vecchio (o assente): si chiede, intanto si mostra quello che c'e'.
        const pending = fetchHero(type, id);
        if (!pending) return undefined;
        let cancelled = false;
        pending.finally(() => {
            if (!cancelled) setSettledKey(key);
        });
        return () => {
            cancelled = true;
        };
    }, [key]);
    return {
        // Il meta del catalogo sotto, Cinemeta sopra (descrizione compresa:
        // quella del catalogo dice PERCHE' la card e' nella riga, non di cosa
        // parla il titolo).
        meta: rawMeta && hero ? { ...rawMeta, ...hero.meta } : rawMeta,
        ratings: hero ? hero.ratings : NO_RATINGS,
        availability: hero ? hero.availability : NO_AVAILABILITY,
        done: !key || !!hero || settledKey === key,
    };
};

// Data compatta dell'uscita DIGITALE, o null se non la sappiamo / non e' un
// film. Formato uguale al resto della UI (`toLocaleDateString` senza locale
// forzata), cosi' la riga non mescola due lingue.
// ⚠️ Solo se la data digitale cade entro l'anno dopo l'uscita del film: sui
// film vecchi TMDB ha come "digitale" una riedizione (Spider-Man 2002 -> 13 dic
// 2016), e mostrarla al posto dell'anno diceva l'anno sbagliato.
const MAX_DIGITAL_YEARS_AFTER = 1;
const digitalDateLabel = (meta, availability) => {
    if (meta.type !== 'movie' || !availability || !availability.loaded) return null;
    const iso = availability.digitalRelease;
    if (typeof iso !== 'string' || iso.length === 0) return null;
    const t = Date.parse(iso);
    if (!isFinite(t)) return null;
    const filmYear = parseInt(meta.year ?? meta.releaseInfo, 10);
    if (filmYear > 0 && new Date(t).getFullYear() - filmYear > MAX_DIGITAL_YEARS_AFTER) return null;
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

// Casa: marchio (dal backend, `availability.ts` PLATFORMS) -> classe col suo
// colore. ⚠️ Un marchio che non e' qui NON si disegna: meglio nessun bollino di
// uno grigio che non si riconosce (STARZ tolto il 2026-09-27: "mai sentita").
const PLATFORM_CLASS = {
    'Netflix': 'netflix',
    'Prime Video': 'prime',
    'Apple TV': 'apple',
    'Disney+': 'disney',
    'HBO': 'hbo',
    'Hulu': 'hulu',
    'Paramount+': 'paramount',
    'Peacock': 'peacock',
    'Sky': 'sky',
    'Crunchyroll': 'crunchyroll',
};

// ~2 righe a 4rem nel riquadro del logo (28rem).
const HERO_TITLE_LONG_CHARS = 20;

const BoardHero = ({ meta: rawMeta }) => {
    // ⚠️ Prima delle uscite anticipate: gli hook non possono stare sotto un
    // `return`. Con `meta` nullo non chiede niente.
    const { meta, ratings, availability, done: enrichmentDone } = useCasaHero(rawMeta);
    if (!meta) {
        return <div className={styles['board-hero-container']} />;
    }

    // ⚠️ Cinemeta PRIMA (e' gia' in memoria), il dataset IMDb quando Cinemeta non
    // ce l'ha: sui titoli usciti da poche settimane Cinemeta e' indietro, e
    // l'hero restava senza nessun voto proprio sulle novita' — che sono il
    // contenuto di meta' delle righe.
    const rating = meta.imdbRating
        ? `${meta.imdbRating}`
        : (typeof ratings.imdb === 'number' ? ratings.imdb.toFixed(1) : null);
    // ⚠️ Il voto Letterboxd sta ANCHE qui, non solo nel dettaglio: questa e' la
    // riga che si legge dalla home, ed e' quella che l'utente guarda per
    // decidere. Su tanti film nuovi Cinemeta non ha ancora l'imdbRating (torna
    // stringa vuota) — senza Letterboxd l'hero non mostrava NESSUN voto, e la
    // riga sotto sembrava ordinata a caso.
    const lbRating = typeof ratings.rating10 === 'number' ? ratings.rating10.toFixed(1) : null;
    // ⚠️ Film o serie, DETTO: era la domanda per cui bisognava entrare nella
    // pagina e tornare indietro — cioe' esattamente il passo da togliere.
    const typeLabel = meta.type === 'movie' ? 'Film' : meta.type === 'series' ? 'Serie' : null;
    // ⚠️ `releaseInfo` di Cinemeta e' il solo ANNO ("2026"), che su una riga di
    // NOVITA' non dice niente: fra "uscito tre giorni fa" e "uscito a gennaio"
    // c'e' tutta la differenza. Quando conosciamo la data DIGITALE del film
    // (quella da cui lo si puo' guardare davvero) mostriamo quella, che l'anno
    // ce l'ha dentro. Serie e film senza data: resta l'anno, come prima.
    const releaseText = digitalDateLabel(meta, availability) ?? meta.releaseInfo;
    const genresText = Array.isArray(meta.genres) ? meta.genres.slice(0, 3).join(' · ') : null;
    const castText = Array.isArray(meta.cast) ? meta.cast.slice(0, 3).join(', ') : null;
    const directorText = Array.isArray(meta.director) ? meta.director.slice(0, 2).join(', ') : null;
    // Se non c'e' background, fallback al poster (blur per non distrarre).
    const bgSrc = (typeof meta.background === 'string' && meta.background.length > 0)
        ? meta.background
        : (typeof meta.poster === 'string' && meta.poster.length > 0 ? meta.poster : null);
    const bgIsPoster = bgSrc === meta.poster;

    // Senza logo il titolo e' testo a 4rem in un riquadro alto 10rem: un nome
    // lungo andava su 5 righe e usciva dall'alto ("Nord Sud Ovest Est: La
    // leggendaria storia degli 883", 25/10/2026). Oltre la soglia corpo piu'
    // piccolo, massimo 3 righe (stessa idea del titolo della pagina serie).
    const title = (
        <div className={classnames(styles['hero-title'], { [styles['long']]: typeof meta.name === 'string' && meta.name.length > HERO_TITLE_LONG_CHARS })}>
            {meta.name}
        </div>
    );
    return (
        <div className={classnames(styles['board-hero-container'], 'animation-fade-in')}>
            {
                bgSrc ?
                    <div className={classnames(styles['hero-bg-layer'], { [styles['blurred']]: bgIsPoster })}>
                        <Image
                            key={meta.id}
                            className={styles['hero-bg-image']}
                            src={bgSrc}
                            alt={' '}
                            renderFallback={() => null}
                        />
                        <div className={styles['hero-bg-gradient']} />
                    </div>
                    :
                    null
            }
            <div className={styles['hero-info']}>
                <div className={styles['hero-logo-slot']}>
                    {
                        typeof meta.logo === 'string' && meta.logo.length > 0 ?
                            <Image
                                key={meta.id + '-logo'}
                                className={styles['hero-logo']}
                                src={meta.logo}
                                alt={meta.name}
                                renderFallback={() => title}
                            />
                            : enrichmentDone ? title : null
                    }
                </div>
                <div className={styles['hero-subline']}>
                    {typeLabel ?
                        <span className={classnames(styles['sub-item'], styles['type-label'])}>{typeLabel}</span> : null}
                    {/* Casa: chi l'ha PRODOTTO (HBO, Netflix, Apple TV...), dal
                        backend (`availability.ts`, platformName). Niente
                        bollino per film del cinema e canali TV classici. */}
                    {PLATFORM_CLASS[availability.platform] ?
                        <span className={classnames(styles['sub-item'], styles['platform-badge'], styles[PLATFORM_CLASS[availability.platform]])}>{availability.platform}</span> : null}
                    {typeof meta.runtime === 'string' && meta.runtime.length > 0 ?
                        <span className={styles['sub-item']}>{meta.runtime}</span> : null}
                    {typeof releaseText === 'string' && releaseText.length > 0 ?
                        <span className={styles['sub-item']}>{releaseText}</span> : null}
                    {rating ?
                        <span className={classnames(styles['sub-item'], styles['rating'])}>
                            {rating}
                            <ImdbMark className={styles['imdb-badge']} />
                        </span> : null}
                    {/* ⚠️ Metacritic RIMOSSO il 2026-08-31 su richiesta: c'era
                        su ~1 titolo su 3, quindi la riga cambiava forma da un
                        poster all'altro e il badge in piu' confondeva invece di
                        informare. Rotten Tomatoes resta (~6%), ma se anche lui
                        da' la stessa impressione va tolto con lo stesso criterio.
                        Il dato continua ad arrivare dal backend: e' solo non
                        mostrato. */}
                    {typeof ratings.rt === 'number' ?
                        <span className={classnames(styles['sub-item'], styles['rating'])}>
                            {ratings.rt}%
                            <Image className={styles['rt-badge']} src={require('/assets/images/rottentomatoes_icon.png')} alt={'Rotten Tomatoes'} />
                        </span> : null}
                    {lbRating ?
                        <span className={classnames(styles['sub-item'], styles['rating'])}>
                            {lbRating}
                            <LetterboxdMark className={styles['letterboxd-mark']} />
                        </span> : null}
                    {genresText ?
                        <span className={classnames(styles['sub-item'], styles['genres'])}>{genresText}</span> : null}
                </div>
                {
                    typeof meta.description === 'string' && meta.description.length > 0 ?
                        <div className={styles['hero-description']}>{meta.description}</div>
                        : null
                }
                {
                    directorText || castText ?
                        <div className={styles['hero-cast']}>
                            {directorText ?
                                <span className={styles['hero-credit']}>
                                    <span className={styles['hero-credit-label']}>{t('CASA_DIRECTOR')}</span>{directorText}
                                </span>
                                : null}
                            {directorText && castText ?
                                <span className={styles['hero-credit-sep']} aria-hidden={true} />
                                : null}
                            {castText ?
                                <span className={styles['hero-credit']}>
                                    <span className={styles['hero-credit-label']}>{t('CASA_CAST')}</span>{castText}
                                </span>
                                : null}
                        </div>
                        : null
                }
            </div>
        </div>
    );
};

BoardHero.propTypes = {
    meta: PropTypes.object,
};

module.exports = BoardHero;
