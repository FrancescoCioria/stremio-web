// Copyright (C) 2017-2026 Smart code 203358507

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
// @ts-expect-error — casaBackend e' un modulo JS (CommonJS) senza tipi
import { casaBeacon } from 'stremio/common/casaBackend';
// @ts-expect-error — casaEmbeddedSubs e' un modulo JS (CommonJS) senza tipi
import { resolveSavedExtraTrack } from 'stremio/common/casaEmbeddedSubs';
import { CONSTANTS, languages, onFileDrop, onShortcut, useToast } from 'stremio/common';

const withFallbackLabels = (tracks?: SubtitleTrack[] | null): SubtitleTrack[] => {
    if (!Array.isArray(tracks)) {
        return [];
    }

    return tracks.map((track) => ({
        ...track,
        label: track.label || track.url || '',
    }));
};

const findTrackById = (tracks: SubtitleTrack[], id?: string | null) => {
    if (!id) {
        return undefined;
    }

    return tracks.find((track) => track.id === id);
};

const findTrackByLanguage = (tracks: SubtitleTrack[], language?: string | null) => {
    if (!language) {
        return undefined;
    }

    const languageCode = languages.toCode(language);

    return tracks.find((track) => {
        return track.lang === language || languages.toCode(track.lang) === languageCode;
    });
};

const useSubtitles = ({
    player,
    video,
    settings,
    streamStateChanged,
    menusOpen,
    closeMenus,
    closeSubtitlesMenu,
    toggleSubtitlesMenu,
}: UseSubtitlesArgs): UseSubtitlesResult => {
    const { t } = useTranslation();
    const toast = useToast();
    const videoRef = useRef(video);
    const settingsRef = useRef(settings);
    const defaultTrackSelected = useRef(false);
    const lastSelectedTrack = useRef<SelectedSubtitleTrack | null>(null);

    videoRef.current = video;
    settingsRef.current = settings;

    const streamSubtitles = useMemo(() => {
        return withFallbackLabels(player.selected?.stream.subtitles);
    }, [player.selected]);

    const externalSubtitles = useMemo(() => {
        return withFallbackLabels(player.subtitles);
    }, [player.subtitles]);

    const allTracks = useMemo(() => {
        return video.state.subtitlesTracks.concat(video.state.extraSubtitlesTracks);
    }, [video.state.subtitlesTracks, video.state.extraSubtitlesTracks]);

    const hasTracks = allTracks.length > 0;

    const applySubtitleStyle = useCallback(() => {
        const currentSettings = settingsRef.current;
        const currentVideo = videoRef.current;

        currentVideo.setSubtitlesSize(currentSettings.subtitlesSize);
        currentVideo.setSubtitlesOffset(currentSettings.subtitlesOffset);
        currentVideo.setSubtitlesTextColor(currentSettings.subtitlesTextColor);
        currentVideo.setSubtitlesBackgroundColor(currentSettings.subtitlesBackgroundColor);
        currentVideo.setSubtitlesOutlineColor(currentSettings.subtitlesOutlineColor);
    }, []);

    const rememberTrack = useCallback((track: SubtitleTrack, embedded: boolean) => {
        lastSelectedTrack.current = { id: track.id, embedded };
        streamStateChanged({
            subtitleTrack: {
                id: track.id,
                embedded,
                lang: track.lang,
            },
        });
    }, [streamStateChanged]);

    const disableSubtitles = useCallback(() => {
        defaultTrackSelected.current = true;
        video.setSubtitlesTrack(null);
        video.setExtraSubtitlesTrack(null);
        streamStateChanged({ subtitleTrack: null });
    }, [streamStateChanged, video]);

    const selectEmbeddedTrack = useCallback((track: SubtitleTrack | null) => {
        if (!track) {
            disableSubtitles();
            return;
        }

        defaultTrackSelected.current = true;
        video.setSubtitlesTrack(track.id);
        rememberTrack(track, true);
    }, [disableSubtitles, rememberTrack, video]);

    const selectExtraTrack = useCallback((track: SubtitleTrack | null) => {
        if (!track) {
            disableSubtitles();
            return;
        }

        defaultTrackSelected.current = true;
        video.setExtraSubtitlesTrack(track.id);
        rememberTrack(track, false);
    }, [disableSubtitles, rememberTrack, video]);

    const changeDelay = useCallback((delay: number) => {
        video.setSubtitlesDelay(delay);
        streamStateChanged({ subtitleDelay: delay });
    }, [streamStateChanged, video]);

    const increaseDelay = useCallback(() => {
        changeDelay((video.state.extraSubtitlesDelay ?? 0) + 250);
    }, [changeDelay, video.state.extraSubtitlesDelay]);

    const decreaseDelay = useCallback(() => {
        changeDelay((video.state.extraSubtitlesDelay ?? 0) - 250);
    }, [changeDelay, video.state.extraSubtitlesDelay]);

    const changeSize = useCallback((size: number) => {
        video.setSubtitlesSize(size);
        streamStateChanged({ subtitleSize: size });
    }, [streamStateChanged, video]);

    const updateSize = useCallback((delta: number) => {
        const sizes = CONSTANTS.SUBTITLES_SIZES as number[];
        const sizeIndex = sizes.indexOf(video.state.subtitlesSize ?? -1);
        const nextIndex = Math.max(0, Math.min(sizes.length - 1, sizeIndex + delta));

        changeSize(sizes[nextIndex]);
    }, [changeSize, video.state.subtitlesSize]);

    const changeOffset = useCallback((offset: number) => {
        video.setSubtitlesOffset(offset);
        streamStateChanged({ subtitleOffset: offset });
    }, [streamStateChanged, video]);

    onFileDrop(CONSTANTS.SUPPORTED_LOCAL_SUBTITLES, (file: File, buffer: ArrayBuffer) => {
        videoRef.current.addLocalSubtitles(file.name, buffer);
    });

    // Casa (2026-07-13): al cambio episodio il core espone per ~1s uno stato
    // INCOERENTE — `player.selected` e' gia' il video nuovo, ma `player.subtitles`
    // sono ancora quelle del PRECEDENTE. Questo effetto rifiora sul cambio di
    // `video.state.stream` e, senza guardia, infila nel player nuovo le tracce
    // vecchie; la selezione qui sotto ne sceglie una per lingua e richiude il latch
    // `defaultTrackSelected` -> quando 1s dopo arrivano le tracce GIUSTE vengono
    // accodate ma non le seleziona piu' nessuno. Risultato: l'episodio nuovo si
    // guarda coi sottotitoli del vecchio (bug riportato dall'utente: E08 -> E09).
    //
    // Provato con le URL di OpenSubtitles, che contengono l'id del file: al load di
    // E03 aggiungevamo gli STESSI 24 file appena aggiunti per E02, e un secondo dopo
    // arrivavano i 23 veri.
    //
    // Guardia: se lo stream e' cambiato ma le tracce sono IDENTICHE a quelle
    // dell'ultima aggiunta, sono stantie per costruzione -> si aspetta (arrivano
    // subito dopo e questo effetto rifiora, perche' `externalSubtitles` e' fra le
    // dipendenze). NB: il latch resta false, quindi la selezione avviene sulle
    // tracce giuste; nel frattempo l'embedded fa da fallback non bloccante, come
    // gia' previsto dalla logica qui sotto.
    const lastAddedRef = useRef<{ stream: unknown; sig: string } | null>(null);

    useEffect(() => {
        if (video.state.stream === null) {
            return;
        }

        const sig = externalSubtitles
            .map((s: { url?: string; id?: string }) => String(s.url ?? s.id ?? ''))
            .join('|');
        const last = lastAddedRef.current;
        const stale = last !== null && last.stream !== video.state.stream && last.sig === sig;

        casaBeacon('/debug/player-event', {
            ev: 'subs-add',
            selectedVideoId: player.selected?.streamRequest?.path?.id ?? null,
            count: externalSubtitles.length,
            stale,   // true = scartate perche' del video precedente (il bug, ora tappato)
            subUrls: externalSubtitles.slice(0, 3).map((s: { url?: string; id?: string }) =>
                String(s.url ?? s.id ?? '').slice(0, 140)),
        });

        if (stale) {
            return;
        }

        lastAddedRef.current = { stream: video.state.stream, sig };
        video.addExtraSubtitlesTracks(externalSubtitles);
    }, [externalSubtitles, video.state.stream]);

    useEffect(() => {
        if (defaultTrackSelected.current) {
            return;
        }

        if (settings.subtitlesLanguage === null) {
            video.setSubtitlesTrack(null);
            video.setExtraSubtitlesTrack(null);
            defaultTrackSelected.current = true;
            return;
        }

        const savedTrack = player.streamState?.subtitleTrack;
        const savedTrackId = savedTrack?.id;
        const savedLanguage = savedTrack?.lang;
        const embeddedTrack = savedTrackId ?
            findTrackById(video.state.subtitlesTracks, savedTrackId)
            :
            findTrackByLanguage(video.state.subtitlesTracks, savedLanguage ?? settings.subtitlesLanguage);
        // Casa: un id EMBEDDED_<n> salvato risolve anche alla controparte
        // CASA_EMB_<n> (stesso sub del file, estratto intero). Senza questo
        // alias il match-per-id-esatto non trova mai le nostre tracce, ricade
        // sul ramo embedded qui sotto e CHIUDE il latch -> la traccia in-band
        // rotta torna e non se ne esce piu'. Vedi casaEmbeddedSubs.js.
        const extraTrack = savedTrackId ?
            resolveSavedExtraTrack(savedTrackId, video.state.extraSubtitlesTracks, savedLanguage, languages.toCode)
            :
            findTrackByLanguage(video.state.extraSubtitlesTracks, savedLanguage ?? settings.subtitlesLanguage);

        // Casa: preferiamo gli EXTRA (OpenSubtitles = file SRT separato) agli
        // EMBEDDED (cue in-band muxate nel transcode HLS). Motivo: gli embedded
        // "si bloccano" durante il film — le cue in-band si esauriscono
        // (CUE_SUPPLY_LOW nel log di debug), mentre gli extra no. Upstream
        // preferiva gli embedded: qui l'ordine e' INVERTITO.
        // Gli extra caricano async dall'addon OpenSubtitles: finche' non
        // arrivano usiamo l'embedded come fallback SENZA bloccare, cosi' quando
        // l'extra per la lingua compare ci switchiamo sopra. Una scelta embedded
        // SALVATA esplicitamente dall'utente (savedTrack.embedded===true) va
        // invece rispettata e blocca.
        if (extraTrack?.id) {
            if (video.state.selectedExtraSubtitlesTrackId !== extraTrack.id ||
                video.state.selectedSubtitlesTrackId !== null) {
                video.setExtraSubtitlesTrack(extraTrack.id);
            }

            defaultTrackSelected.current = true;
            return;
        }

        if (embeddedTrack?.id) {
            if (video.state.selectedSubtitlesTrackId !== embeddedTrack.id ||
                video.state.selectedExtraSubtitlesTrackId !== null) {
                video.setSubtitlesTrack(embeddedTrack.id);
            }

            if (savedTrack?.embedded === true) {
                defaultTrackSelected.current = true;
            }
            return;
        }
    }, [
        player.streamState,
        settings.subtitlesLanguage,
        video.state.extraSubtitlesTracks,
        video.state.selectedExtraSubtitlesTrackId,
        video.state.selectedSubtitlesTrackId,
        video.state.subtitlesTracks,
    ]);

    // Casa: UPGRADE embedded -> Casa, indipendente dal latch.
    //
    // ⚠️ SERVE ANCHE CON L'ALIAS SOPRA, per una CORSA. L'alias risolve solo se le
    // tracce Casa esistono NEL MOMENTO in cui l'auto-select gira. Ma le nostre
    // arrivano async (probe /hlsv2 -> add), mentre le EMBEDDED_<n> compaiono man
    // mano che hls.js aggancia le text track. Se le embedded vincono la corsa:
    // l'auto-select prende il ramo embedded, e con una preferenza salvata
    // `embedded:true` CHIUDE il latch -> quando 1s dopo arrivano le tracce Casa
    // l'effetto esce subito e non le seleziona piu' NESSUNO. Stesso identico
    // sintomo del bug che stiamo chiudendo, ma silenzioso e intermittente
    // (dipende da chi arriva prima: su E02 il 2026-07-18 avevamo vinto noi).
    //
    // Non alziamo il latch nel ramo embedded per non riaccendere i sottotitoli
    // che l'utente ha SPENTO col tasto (`toggleSubtitles` non tocca il latch:
    // con l'auto-select ancora armato glieli rimetteremmo addosso). Qui invece
    // agiamo solo se una traccia embedded e' DAVVERO selezionata.
    //
    // Una volta per stream: dopo l'upgrade il ref e' speso, quindi una scelta
    // manuale successiva dell'utente non viene piu' scavalcata.
    const upgradedForRef = useRef<unknown>(null);

    useEffect(() => {
        if (video.state.stream === null) {
            return;
        }

        if (upgradedForRef.current === video.state.stream) {
            return;
        }

        const selectedEmbeddedId = video.state.selectedSubtitlesTrackId;
        if (!selectedEmbeddedId || video.state.selectedExtraSubtitlesTrackId !== null) {
            return;
        }

        const embeddedTrack = findTrackById(video.state.subtitlesTracks, selectedEmbeddedId);
        const casaTrack = resolveSavedExtraTrack(
            selectedEmbeddedId,
            video.state.extraSubtitlesTracks,
            embeddedTrack?.lang,
            languages.toCode,
        );
        if (!casaTrack?.id) {
            return;
        }

        upgradedForRef.current = video.state.stream;
        // `selectExtraTrack` (non `video.setExtraSubtitlesTrack`) per chiudere il
        // latch e registrare la scelta per la sessione.
        //
        // ⚠️ NON aspettarti che sopravviva all'episodio successivo: il core, nel
        // carry-over, fa `subtitle_track.filter(|t| t.embedded)` -> una traccia
        // ESTERNA (le nostre sono `embedded:false`) viene SEMPRE scartata,
        // insieme alla sua lingua. Quindi l'episodio N+1 riparte o da una
        // preferenza embedded ereditata (e questo effetto rifa' l'upgrade) o da
        // nessuna preferenza (e l'auto-select sceglie per LINGUA fra gli esterni,
        // che vanno comunque bene). E' anche il motivo per cui l'utente finiva
        // sempre sull'in-band: l'embedded si tramanda, la nostra no.
        selectExtraTrack(casaTrack);
    }, [
        selectExtraTrack,
        video.state.extraSubtitlesTracks,
        video.state.selectedExtraSubtitlesTrackId,
        video.state.selectedSubtitlesTrackId,
        video.state.stream,
        video.state.subtitlesTracks,
    ]);

    useEffect(() => {
        if (video.state.stream === null) {
            return;
        }

        const delay = player.streamState?.subtitleDelay;
        if (typeof delay === 'number') {
            video.setSubtitlesDelay(delay);
        }

        const size = player.streamState?.subtitleSize;
        if (typeof size === 'number') {
            video.setSubtitlesSize(size);
        }

        const offset = player.streamState?.subtitleOffset;
        if (typeof offset === 'number') {
            video.setSubtitlesOffset(offset);
        }
    }, [player.streamState, video.state.stream]);

    useEffect(() => {
        defaultTrackSelected.current = false;
        lastSelectedTrack.current = null;
    }, [video.state.stream]);

    useEffect(() => {
        if (!hasTracks) {
            closeSubtitlesMenu();
        }
    }, [closeSubtitlesMenu, hasTracks]);

    useEffect(() => {
        const onSubtitlesTrackLoaded = () => {
            toast.show({
                type: 'success',
                title: t('PLAYER_SUBTITLES_LOADED'),
                message: t('PLAYER_SUBTITLES_LOADED_EMBEDDED'),
                timeout: 3000,
            });
        };

        const onExtraSubtitlesTrackLoaded = (track: SubtitleTrack) => {
            toast.show({
                type: 'success',
                title: t('PLAYER_SUBTITLES_LOADED'),
                message: track.exclusive ?
                    t('PLAYER_SUBTITLES_LOADED_EXCLUSIVE')
                    :
                    track.local ?
                        t('PLAYER_SUBTITLES_LOADED_LOCAL')
                        :
                        t('PLAYER_SUBTITLES_LOADED_ORIGIN', { origin: track.origin }),
                timeout: 3000,
            });
        };

        const onExtraSubtitlesTrackAdded = (track: SubtitleTrack) => {
            if (track.local) {
                videoRef.current.setExtraSubtitlesTrack(track.id);
            }
        };

        video.events.on('subtitlesTrackLoaded', onSubtitlesTrackLoaded);
        video.events.on('extraSubtitlesTrackLoaded', onExtraSubtitlesTrackLoaded);
        video.events.on('extraSubtitlesTrackAdded', onExtraSubtitlesTrackAdded);
        video.events.on('implementationChanged', applySubtitleStyle);

        return () => {
            video.events.off('subtitlesTrackLoaded', onSubtitlesTrackLoaded);
            video.events.off('extraSubtitlesTrackLoaded', onExtraSubtitlesTrackLoaded);
            video.events.off('extraSubtitlesTrackAdded', onExtraSubtitlesTrackAdded);
            video.events.off('implementationChanged', applySubtitleStyle);
        };
    }, [applySubtitleStyle, t, toast, video.events]);

    onShortcut('subtitlesDelay', (combo) => {
        combo === 1 ? increaseDelay() : decreaseDelay();
    }, [increaseDelay, decreaseDelay], !menusOpen);

    onShortcut('subtitlesSize', (combo) => {
        combo === 1 ? updateSize(1) : updateSize(-1);
    }, [updateSize], !menusOpen);

    onShortcut('toggleSubtitles', () => {
        const subtitlesEnabled = video.state.selectedSubtitlesTrackId !== null ||
            video.state.selectedExtraSubtitlesTrackId !== null;

        if (subtitlesEnabled) {
            if (video.state.selectedSubtitlesTrackId) {
                lastSelectedTrack.current = {
                    id: video.state.selectedSubtitlesTrackId,
                    embedded: true,
                };
            } else if (video.state.selectedExtraSubtitlesTrackId) {
                lastSelectedTrack.current = {
                    id: video.state.selectedExtraSubtitlesTrackId,
                    embedded: false,
                };
            }

            video.setSubtitlesTrack(null);
            video.setExtraSubtitlesTrack(null);
            return;
        }

        const savedTrack = player.streamState?.subtitleTrack ?? lastSelectedTrack.current;
        if (savedTrack?.id) {
            savedTrack.embedded ?
                video.setSubtitlesTrack(savedTrack.id)
                :
                video.setExtraSubtitlesTrack(savedTrack.id);
        }
    }, [
        player.streamState,
        video.state.selectedExtraSubtitlesTrackId,
        video.state.selectedSubtitlesTrackId,
    ], !menusOpen);

    onShortcut('subtitlesMenu', () => {
        closeMenus();
        // TV fork: apri SEMPRE il menu, anche senza tracks (il SubtitlesMenu
        // mostra "PLAYER_SUBTITLES_DISABLED"). Aprire condizionalmente
        // lasciava l'utente senza feedback: su TV premere il tasto e non
        // vedere nulla dava l'impressione che fosse rotto.
        toggleSubtitlesMenu();
    }, [closeMenus, toggleSubtitlesMenu]);

    const menuProps = useMemo(() => ({
        subtitlesLanguage: settings.subtitlesLanguage,
        interfaceLanguage: settings.interfaceLanguage,
        subtitlesTracks: video.state.subtitlesTracks,
        selectedSubtitlesTrackId: video.state.selectedSubtitlesTrackId,
        subtitlesOffset: video.state.subtitlesOffset,
        subtitlesSize: video.state.subtitlesSize,
        extraSubtitlesTracks: video.state.extraSubtitlesTracks,
        selectedExtraSubtitlesTrackId: video.state.selectedExtraSubtitlesTrackId,
        extraSubtitlesOffset: video.state.extraSubtitlesOffset,
        extraSubtitlesDelay: video.state.extraSubtitlesDelay,
        extraSubtitlesSize: video.state.extraSubtitlesSize,
        onSubtitlesTrackSelected: selectEmbeddedTrack,
        onExtraSubtitlesTrackSelected: selectExtraTrack,
        onSubtitlesOffsetChanged: changeOffset,
        onSubtitlesSizeChanged: changeSize,
        onExtraSubtitlesOffsetChanged: changeOffset,
        onExtraSubtitlesDelayChanged: changeDelay,
        onExtraSubtitlesSizeChanged: changeSize,
    }), [
        changeDelay,
        changeOffset,
        changeSize,
        selectEmbeddedTrack,
        selectExtraTrack,
        settings.interfaceLanguage,
        settings.subtitlesLanguage,
        video.state.extraSubtitlesDelay,
        video.state.extraSubtitlesOffset,
        video.state.extraSubtitlesSize,
        video.state.extraSubtitlesTracks,
        video.state.selectedExtraSubtitlesTrackId,
        video.state.selectedSubtitlesTrackId,
        video.state.subtitlesOffset,
        video.state.subtitlesSize,
        video.state.subtitlesTracks,
    ]);

    return {
        streamSubtitles,
        allSubtitleTracks: allTracks,
        extraSubtitleTracks: video.state.extraSubtitlesTracks,
        selectedExtraSubtitleTrackId: video.state.selectedExtraSubtitlesTrackId,
        subtitlesMenuProps: menuProps,
    };
};

export default useSubtitles;
