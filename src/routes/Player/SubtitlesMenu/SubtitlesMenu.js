// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { languages } = require('stremio/common');
const { SUBTITLES_SIZES, DEFAULT_SUBTITLES_LANGUAGE, LOCAL_SUBTITLES_LANGUAGE } = require('stremio/common/CONSTANTS');
const { Button } = require('stremio/components');
const styles = require('./styles');
const { t } = require('i18next');
const { default: Stepper } = require('./Stepper');
const { default: SubtitleVariant } = require('./SubtitleVariant');

const ORIGIN_PRIORITIES = [
    'LOCAL',
    'EMBEDDED',
    'EXCLUSIVE',
];

const normalizeTracksLang = (tracks) => tracks.map((track) => ({
    ...track,
    lang: languages.toCode(track.lang),
}));

const sortByValues = (items, values) => items.sort((a, b) => {
    const left = values.indexOf(a);
    const right = values.indexOf(b);
    if (left === -1 && right === -1) return 0;
    if (left === -1) return 1;
    if (right === -1) return -1;
    return left - right;
});

const SubtitlesMenu = React.memo(React.forwardRef((props, ref) => {
    // Ref interno (oltre al forwardRef esterno) per poter cercare la
    // language-option attualmente selezionata e darle il focus al mount.
    const innerRef = React.useRef(null);
    const setRef = React.useCallback((node) => {
        innerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
    }, [ref]);

    const subtitlesTracks = React.useMemo(() => {
        return normalizeTracksLang(Array.isArray(props.subtitlesTracks) ? props.subtitlesTracks : []);
    }, [props.subtitlesTracks]);

    const extraSubtitlesTracks = React.useMemo(() => {
        return normalizeTracksLang(Array.isArray(props.extraSubtitlesTracks) ? props.extraSubtitlesTracks : []);
    }, [props.extraSubtitlesTracks]);

    const allSubtitles = React.useMemo(() => {
        return subtitlesTracks.concat(extraSubtitlesTracks);
    }, [subtitlesTracks, extraSubtitlesTracks]);

    const subtitlesLanguages = React.useMemo(() => {
        const userLanguage = languages.toCode(props.subtitlesLanguage) ?? DEFAULT_SUBTITLES_LANGUAGE;
        const interfaceLanguage = languages.toCode(props.interfaceLanguage) ?? DEFAULT_SUBTITLES_LANGUAGE;
        const priorities = [LOCAL_SUBTITLES_LANGUAGE, userLanguage, interfaceLanguage];
        const langs = [...new Set(allSubtitles.map(({ lang }) => lang))].sort((a, b) => a.localeCompare(b));
        return sortByValues(langs, priorities);
    }, [allSubtitles, props.subtitlesLanguage, props.interfaceLanguage]);

    const selectedSubtitlesLanguage = React.useMemo(() => {
        return typeof props.selectedSubtitlesTrackId === 'string' ?
            subtitlesTracks
                .reduce((selectedSubtitlesLanguage, { id, lang }) => {
                    if (id === props.selectedSubtitlesTrackId) {
                        return lang;
                    }

                    return selectedSubtitlesLanguage;
                }, null)
            :
            typeof props.selectedExtraSubtitlesTrackId === 'string' ?
                extraSubtitlesTracks
                    .reduce((selectedSubtitlesLanguage, { id, lang }) => {
                        if (id === props.selectedExtraSubtitlesTrackId) {
                            return lang;
                        }

                        return selectedSubtitlesLanguage;
                    }, null)
                :
                null;
    }, [subtitlesTracks, extraSubtitlesTracks, props.selectedSubtitlesTrackId, props.selectedExtraSubtitlesTrackId]);
    const subtitlesTracksForLanguage = React.useMemo(() => {
        const tracks = allSubtitles.filter(({ lang }) => lang === selectedSubtitlesLanguage);
        return sortByValues(tracks, ORIGIN_PRIORITIES);
    }, [allSubtitles, selectedSubtitlesLanguage]);
    const onMouseDown = React.useCallback((event) => {
        event.nativeEvent.subtitlesMenuClosePrevented = true;
    }, []);
    const subtitlesLanguageOnClick = React.useCallback((event) => {
        const tracks = allSubtitles.filter(({ lang }) => lang === event.currentTarget.dataset.lang);
        const track = sortByValues(tracks, ORIGIN_PRIORITIES).shift();

        if (!track) {
            if (typeof props.onSubtitlesTrackSelected === 'function') {
                props.onSubtitlesTrackSelected(null);
            }
            if (typeof props.onExtraSubtitlesTrackSelected === 'function') {
                props.onExtraSubtitlesTrackSelected(null);
            }
        } else if (track.embedded) {
            if (typeof props.onSubtitlesTrackSelected === 'function') {
                props.onSubtitlesTrackSelected(track);
            }
        } else {
            if (typeof props.onExtraSubtitlesTrackSelected === 'function') {
                props.onExtraSubtitlesTrackSelected(track);
            }
        }
    }, [allSubtitles, props.onSubtitlesTrackSelected, props.onExtraSubtitlesTrackSelected]);
    const subtitlesTrackOnSelect = React.useCallback((track) => {
        if (track.embedded) {
            if (typeof props.onSubtitlesTrackSelected === 'function') {
                props.onSubtitlesTrackSelected(track);
            }
        } else {
            if (typeof props.onExtraSubtitlesTrackSelected === 'function') {
                props.onExtraSubtitlesTrackSelected(track);
            }
        }
    }, [props.onSubtitlesTrackSelected, props.onExtraSubtitlesTrackSelected]);
    // Casa: NIENTE guardia su `selectedExtraSubtitlesTrackId` (a differenza di
    // SIZE/OFFSET sotto, che hanno un ramo anche per l'embedded). Quel prop qui
    // e' `displayedExtraSelection(...)` (vedi useSubtitles.ts + casaEmbeddedSubs.js):
    // torna SEMPRE null quando il sottotitolo attivo e' un nostro CASA_EMB_* — che
    // e' il caso normale, visto che l'utente vede un solo sottotitolo per lingua e
    // il pallino resta sulla riga embedded. Con la guardia il DELAY non scattava
    // MAI sui nostri sottotitoli ("resta sempre su 0s", incidente 2026-09-03).
    // Il gate giusto e' lo stesso della Stepper stessa: `extraSubtitlesDelay`
    // (valore REALE dal core, non mascherato) e' null solo quando il concetto di
    // delay non si applica affatto (nessuna istanza di sottotitoli extra viva).
    const onSubtitlesDelayChanged = React.useCallback((value) => {
        if (props.extraSubtitlesDelay !== null && !isNaN(props.extraSubtitlesDelay)) {
            if (typeof props.onExtraSubtitlesDelayChanged === 'function') {
                props.onExtraSubtitlesDelayChanged(value * 1000);
            }
        }
    }, [props.extraSubtitlesDelay, props.onExtraSubtitlesDelayChanged]);
    const onSubtitlesSizeChanged = React.useCallback((value) => {
        if (typeof props.selectedSubtitlesTrackId === 'string') {
            if (props.subtitlesSize !== null && !isNaN(props.subtitlesSize)) {
                if (typeof props.onSubtitlesSizeChanged === 'function') {
                    props.onSubtitlesSizeChanged(value);
                }
            }
        } else if (typeof props.selectedExtraSubtitlesTrackId === 'string') {
            if (props.extraSubtitlesSize !== null && !isNaN(props.extraSubtitlesSize)) {
                if (typeof props.onExtraSubtitlesSizeChanged === 'function') {
                    props.onExtraSubtitlesSizeChanged(value);
                }
            }
        }
    }, [props.selectedSubtitlesTrackId, props.selectedExtraSubtitlesTrackId, props.subtitlesSize, props.extraSubtitlesSize, props.onSubtitlesSizeChanged, props.onExtraSubtitlesSizeChanged]);
    const onSubtitlesOffsetChanged = React.useCallback((value) => {
        if (typeof props.selectedSubtitlesTrackId === 'string') {
            if (props.subtitlesOffset !== null && !isNaN(props.subtitlesOffset)) {
                if (typeof props.onSubtitlesOffsetChanged === 'function') {
                    props.onSubtitlesOffsetChanged(value);
                }
            }
        } else if (typeof props.selectedExtraSubtitlesTrackId === 'string') {
            if (props.extraSubtitlesOffset !== null && !isNaN(props.extraSubtitlesOffset)) {
                if (typeof props.onExtraSubtitlesOffsetChanged === 'function') {
                    props.onExtraSubtitlesOffsetChanged(value);
                }
            }
        }
    }, [props.selectedSubtitlesTrackId, props.selectedExtraSubtitlesTrackId, props.subtitlesOffset, props.extraSubtitlesOffset, props.onSubtitlesOffsetChanged, props.onExtraSubtitlesOffsetChanged]);
    // Al mount, focus sull'opzione lingua attualmente selezionata. Cosi'
    // l'utente da telecomando puo' scorrere ←/→/↑/↓ partendo dalla scelta
    // corrente invece che dal primo bottone (OFF). Doppio rAF: aspetta
    // che la <Transition fade> abbia montato e dipinto.
    React.useEffect(() => {
        const id = requestAnimationFrame(() => requestAnimationFrame(() => {
            const root = innerRef.current;
            if (!root) return;
            const selected = root.querySelector(`.${styles['language-option']}.selected`)
                || root.querySelector(`.${styles['variant-option']}.selected`);
            if (selected && typeof selected.focus === 'function') {
                selected.focus();
            }
        }));
        return () => cancelAnimationFrame(id);
    }, []);

    return (
        <div ref={setRef} className={classnames(props.className, styles['subtitles-menu-container'])} onMouseDown={onMouseDown}>
            <div className={styles['languages-container']}>
                <div className={styles['languages-header']}>{ t('PLAYER_SUBTITLES_LANGUAGES') }</div>
                <div className={styles['languages-list']}>
                    <Button title={t('OFF')} className={classnames(styles['language-option'], { 'selected': selectedSubtitlesLanguage === null })} onClick={subtitlesLanguageOnClick}>
                        <div className={styles['language-label']}>{ t('OFF') }</div>
                        {
                            selectedSubtitlesLanguage === null ?
                                <div className={styles['icon']} />
                                :
                                null
                        }
                    </Button>
                    {subtitlesLanguages.map((lang, index) => (
                        <Button key={index} title={languages.label(lang)} className={classnames(styles['language-option'], { 'selected': selectedSubtitlesLanguage === lang })} data-lang={lang} onClick={subtitlesLanguageOnClick}>
                            <div className={styles['language-label']}>
                                {
                                    lang === 'local' ? t('LOCAL') : languages.label(lang)
                                }
                            </div>
                            {
                                selectedSubtitlesLanguage === lang ?
                                    <div className={styles['icon']} />
                                    :
                                    null
                            }
                        </Button>
                    ))}
                </div>
            </div>
            <div className={styles['variants-container']}>
                <div className={styles['variants-header']}>{ t('PLAYER_SUBTITLES_VARIANTS') }</div>
                {
                    subtitlesTracksForLanguage.length > 0 ?
                        <div className={styles['variants-list']}>
                            {subtitlesTracksForLanguage.map((track, index) => (
                                <SubtitleVariant
                                    key={index}
                                    track={track}
                                    selected={props.selectedSubtitlesTrackId === track.id || props.selectedExtraSubtitlesTrackId === track.id}
                                    onSelect={subtitlesTrackOnSelect}
                                />
                            ))}
                        </div>
                        :
                        <div className={styles['no-variants-container']}>
                            <div className={styles['no-variants-label']}>
                                { t('PLAYER_SUBTITLES_DISABLED') }
                            </div>
                        </div>
                }
            </div>
            <div className={styles['subtitles-settings-container']}>
                <div className={styles['settings-header']}>{t('PLAYER_SUBTITLES_SETTINGS')}</div>
                <div className={styles['settings-list']}>
                    <Stepper
                        className={styles['stepper']}
                        label={'DELAY'}
                        value={props.extraSubtitlesDelay / 1000}
                        unit={'s'}
                        step={0.25}
                        disabled={props.extraSubtitlesDelay === null}
                        onChange={onSubtitlesDelayChanged}
                    />
                    <Stepper
                        className={styles['stepper']}
                        label={'SIZE'}
                        value={props.selectedSubtitlesTrackId ? props.subtitlesSize : props.selectedExtraSubtitlesTrackId ? props.extraSubtitlesSize : null}
                        unit={'%'}
                        step={25}
                        min={SUBTITLES_SIZES[0]}
                        max={SUBTITLES_SIZES[SUBTITLES_SIZES.length - 1]}
                        disabled={(props.selectedSubtitlesTrackId && props.subtitlesSize === null) || (props.selectedExtraSubtitlesTrackId && props.extraSubtitlesSize === null)}
                        onChange={onSubtitlesSizeChanged}
                    />
                    <Stepper
                        className={styles['stepper']}
                        label={'PLAYER_SUBTITLES_VERTICAL_POSITION'}
                        value={props.selectedSubtitlesTrackId ? props.subtitlesOffset : props.selectedExtraSubtitlesTrackId ? props.extraSubtitlesOffset : null}
                        unit={'%'}
                        step={1}
                        min={0}
                        max={100}
                        disabled={(props.selectedSubtitlesTrackId && props.subtitlesOffset === null) || (props.selectedExtraSubtitlesTrackId && props.extraSubtitlesOffset === null)}
                        onChange={onSubtitlesOffsetChanged}
                    />
                </div>
            </div>
        </div>
    );
}));

SubtitlesMenu.displayName = 'MainNavBars';

SubtitlesMenu.propTypes = {
    className: PropTypes.string,
    subtitlesLanguage: PropTypes.string,
    interfaceLanguage: PropTypes.string,
    subtitlesTracks: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        lang: PropTypes.string.isRequired,
        origin: PropTypes.string.isRequired
    })),
    selectedSubtitlesTrackId: PropTypes.string,
    subtitlesOffset: PropTypes.number,
    subtitlesSize: PropTypes.number,
    extraSubtitlesTracks: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        lang: PropTypes.string.isRequired,
        origin: PropTypes.string.isRequired,
        label: PropTypes.string,
        url: PropTypes.string,
        embedded: PropTypes.bool,
        local: PropTypes.bool,
        exclusive: PropTypes.bool
    })),
    selectedExtraSubtitlesTrackId: PropTypes.string,
    extraSubtitlesOffset: PropTypes.number,
    extraSubtitlesDelay: PropTypes.number,
    extraSubtitlesSize: PropTypes.number,
    onSubtitlesTrackSelected: PropTypes.func,
    onExtraSubtitlesTrackSelected: PropTypes.func,
    onSubtitlesOffsetChanged: PropTypes.func,
    onSubtitlesSizeChanged: PropTypes.func,
    onExtraSubtitlesOffsetChanged: PropTypes.func,
    onExtraSubtitlesDelayChanged: PropTypes.func,
    onExtraSubtitlesSizeChanged: PropTypes.func
};

module.exports = SubtitlesMenu;
