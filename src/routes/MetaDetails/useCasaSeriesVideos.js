// Copyright (C) 2017-2026 Smart code 203358507
//
// Casa: la lista episodi UNITA della pagina serie — quelli del core piu' le
// righe extra (episodi che Cinemeta non elenca, common/casaExtraVideos.js) —
// e le scritture del "visto" su quella lista.
//
// ⚠️ UNA lista per tutta la pagina. Prima la fusione la faceva solo VideosList,
// e MetaDetails ragionava sulla lista del core: su X Factor S20 (Cinemeta = solo
// E01) l'hero diceva "stagione vista" guardando E01 e offriva "Togli il visto
// dalla stagione", che avrebbe tolto il visto a E01 e basta; l'episodio a fuoco
// di un extra non si trovava. Chi chiede "quali episodi ci sono" passa da qui.
//
// Scritture: episodio del core -> core (come upstream); riga extra -> backend.
// "Segna la stagione" -> entrambi, ognuno per i suoi.

const React = require('react');
const { useCore } = require('stremio/core');
const { casaBeacon } = require('stremio/common/casaBackend');
const { mergeCasaExtraVideos, autoWatchedIds, migrationPlan, seasonWriteSplit } = require('stremio/common/casaExtraVideos');
const { fetchExtraWatched, postExtraWatched } = require('stremio/common/casaExtraWatched');
const useCasaExtraVideos = require('./useCasaExtraVideos');

// Tentativi gia' fatti in questa sessione della tile: rete contro un giro che
// si ripete (POST che fallisce, core che non applica). Chiave con lo stato del
// flag, cosi' un cambio vero si rifa'.
const autoTried = new Set();
const migrateTried = new Set();
const confirmTried = new Set();

const useCasaSeriesVideos = (metaReady, libraryItem) => {
    const core = useCore();
    const type = metaReady ? metaReady.type : null;
    const metaId = metaReady ? metaReady.id : null;
    const extra = useCasaExtraVideos(type, metaId);

    // `flags` porta il metaId a cui appartiene: cambiando serie, quelli della
    // serie prima non valgono un render di troppo. `flags: null` = non saputi
    // (in volo o backend giu'): niente scritture automatiche.
    const [state, setState] = React.useState({ metaId: null, flags: null });
    // ⚠️ Vale solo la risposta dell'ULTIMA richiesta (GET o POST): arrivate in
    // ordine inverso, la vecchia cancellerebbe dalla pagina un visto appena
    // scritto.
    const seqRef = React.useRef(0);
    const applyLatest = React.useCallback((id, seq, flags) => {
        if (seq !== seqRef.current) return;
        setState((prev) => (prev.metaId === id ? { metaId: id, flags } : prev));
    }, []);
    const reload = React.useCallback((id) => {
        const seq = ++seqRef.current;
        fetchExtraWatched(id).then((flags) => applyLatest(id, seq, flags));
    }, []);
    React.useEffect(() => {
        setState({ metaId, flags: null });
        if (type !== 'series' || !metaId) return;
        reload(metaId);
    }, [type, metaId]);
    const flags = state.metaId === metaId ? state.flags : null;

    const videos = React.useMemo(() => {
        return mergeCasaExtraVideos(
            metaReady ? metaReady.videos : [],
            extra,
            metaId,
            metaReady ? metaReady.background : null,
            libraryItem ? libraryItem.state : null,
            flags,
        );
    }, [metaReady, extra, libraryItem, flags]);

    const extraIds = React.useMemo(() => new Set(videos.filter((v) => v && v.casaExtra).map((v) => v.id)), [videos]);

    // Scrittura nel backend con aggiornamento SUBITO della pagina (stato
    // locale), poi i flag veri dalla risposta; se fallisce si rilegge.
    const writeExtra = React.useCallback((ids, watched, source) => {
        if (!metaId || ids.length === 0) return;
        const ts = Date.now();
        // ⚠️ Con i flag non ancora saputi niente ottimismo: una mappa con i
        // SOLI id appena scritti sembrerebbe "il backend non sa nient'altro" e
        // la scrittura automatica potrebbe passare sopra un "non visto" vero.
        setState((prev) => {
            if (prev.metaId !== metaId || prev.flags === null) return prev;
            const next = { ...(prev.flags || {}) };
            for (const id of ids) next[id] = { watched, ts, source };
            return { metaId, flags: next };
        });
        const seq = ++seqRef.current;
        postExtraWatched(metaId, ids, watched, source).then((fresh) => {
            if (fresh) applyLatest(metaId, seq, fresh);
            else if (seq === seqRef.current) reload(metaId);
        });
    }, [metaId]);

    // Ricostruzione -> backend: un extra che la library dice finito si fissa
    // ORA, perche' la library lo ricorda solo finche' resta l'ultimo aperto.
    React.useEffect(() => {
        if (flags === null || !metaId) return;
        const ids = autoWatchedIds(videos).filter((id) => {
            const f = flags[id];
            const key = `${id}:${f ? f.ts : 'none'}`;
            if (autoTried.has(key)) return false;
            autoTried.add(key);
            return true;
        });
        if (ids.length > 0) writeExtra(ids, true, 'auto');
    }, [videos, flags, metaId]);

    // Migrazione verso il core quando Cinemeta aggiunge l'episodio (vedi
    // migrationPlan). Solo con l'item in library: senza, MarkVideoAsWatched
    // del core non ha dove scrivere e la migrazione si perderebbe.
    React.useEffect(() => {
        if (flags === null || !metaReady || !libraryItem || type !== 'series') return;
        const plan = migrationPlan(metaReady.videos, flags);
        const toDispatch = plan.dispatch.filter((v) => {
            if (migrateTried.has(v.id)) return false;
            migrateTried.add(v.id);
            return true;
        });
        if (toDispatch.length > 0) {
            casaBeacon('/debug/player-event', {
                ev: 'casa-extra-watched-migrate',
                metaId,
                videoIds: toDispatch.map((v) => v.id),
            });
            for (const v of toDispatch) {
                core.transport.dispatch({
                    action: 'MetaDetails',
                    args: { action: 'MarkVideoAsWatched', args: [{ id: v.id, released: v.released }, true] },
                });
            }
        }
        // 'migrated' NELLO STESSO GIRO del dispatch, non al render dopo: se la
        // scrittura slittasse (tile chiusa, POST persa) e l'utente togliesse poi
        // il visto dal core, la sessione dopo lo rimetterebbe.
        const done = toDispatch.map((v) => v.id).concat(plan.confirm.filter((id) => {
            if (confirmTried.has(id)) return false;
            confirmTried.add(id);
            return true;
        }));
        if (done.length > 0) writeExtra(done, true, 'migrated');
    }, [metaReady, libraryItem, flags, metaId, type]);

    // Rilettura dei flag dall'esterno della lista: la pagina torrent scrive il
    // visto (player esterno) senza passare da qui, e tornando alla lista
    // MetaDetails resta montato con lo stesso metaId.
    const refresh = React.useCallback(() => {
        if (type === 'series' && metaId) reload(metaId);
    }, [type, metaId]);

    // Stessa firma di Video.js: `watched` = stato ATTUALE, si scrive l'opposto.
    const markVideo = React.useCallback((video, watched) => {
        if (!video) return;
        if (extraIds.has(video.id)) {
            writeExtra([video.id], !watched, 'user');
            return;
        }
        core.transport.dispatch({
            action: 'MetaDetails',
            args: { action: 'MarkVideoAsWatched', args: [video, !watched] },
        });
    }, [extraIds, writeExtra]);

    // `watched` = la stagione e' vista ADESSO (calcolato sulla lista unita).
    const markSeason = React.useCallback((season, watched) => {
        const split = seasonWriteSplit(videos, season);
        if (split.core) {
            core.transport.dispatch({
                action: 'MetaDetails',
                args: { action: 'MarkSeasonAsWatched', args: [season, !watched] },
            });
        }
        writeExtra(split.extraIds, !watched, 'season');
    }, [videos, writeExtra]);

    return { videos, markVideo, markSeason, refresh };
};

module.exports = useCasaSeriesVideos;
