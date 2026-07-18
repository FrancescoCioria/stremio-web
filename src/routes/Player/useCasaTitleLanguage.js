// Casa: lingua di default AUDIO + SOTTOTITOLI decisa dalla lingua ORIGINALE del
// titolo, e poi ricordata per SERIE.
//
// PROBLEMA: una serie italiana partiva coi sottotitoli inglesi ("Due spicci",
// 2026-07-18). Il default di Stremio e' una lingua fissa nelle impostazioni, che
// non puo' andare bene sia per una serie italiana sia per un anime giapponese.
//
// REGOLA (decisa dall'utente):
//   audio = lingua ORIGINALE
//   sub   = originale se la capiamo (it/en/fr), altrimenti italiano
// Quindi: serie italiana -> tutto italiano; anime -> audio giapponese + sub
// italiani; film inglese -> tutto inglese.
//
// ⚠️ IL DEFAULT VALE SOLO AL PRIMO AVVIO. Appena l'utente sceglie qualcosa, la
// sua scelta comanda e viene ricordata per TUTTO IL TITOLO — anche fra un anno,
// anche per una stagione nuova. Il backend distingue i due casi con `source`
// ("default" | "user"): qui non si decide, si obbedisce.
//
// ⚠️ PERCHE' LA PREFERENZA NON STA NEL CORE. Verificato sul sorgente Rust: il
// bucket `streams` e' keyed su {meta_id, video_id} = PER-EPISODIO, il carry-over
// scarta sempre i sottotitoli esterni e dipende dal `bingeGroup` dell'addon piu'
// una finestra di 30 video -> fra stagioni diverse non regge. La preferenza vive
// nel nostro backend (`title_language_prefs`, chiave = meta_id) e non scade.
//
// ⚠️ Si ragiona in LINGUE, mai in id di traccia: gli id (`EMBEDDED_2`,
// `CASA_EMB_0`, hash OpenSubtitles) sono per-FILE e cambiano ad ogni rip.

const React = require('react');
const { casaBackendUrl } = require('stremio/common/casaBackend');

// `tt1234567:1:4` -> `tt1234567`. La preferenza e' della SERIE, non dell'episodio.
const metaIdFrom = (id) => {
    const s = String(id ?? '');
    const m = /^(tt\d+)/.exec(s);
    return m ? m[1] : (s.split(':')[0] || null);
};

const useCasaTitleLanguage = (player, type) => {
    const [choice, setChoice] = React.useState(null);
    const metaId = metaIdFrom(
        player.selected?.metaRequest?.path?.id ?? player.selected?.streamRequest?.path?.id
    );
    const kind = type === 'series' ? 'series' : 'movie';
    const metaIdRef = React.useRef(null);
    metaIdRef.current = metaId;

    React.useEffect(function() {
        if (!metaId) return;
        const url = casaBackendUrl('/title-language/' + kind + '/' + encodeURIComponent(metaId));
        if (!url) return;

        let cancelled = false;
        setChoice(null); // titolo nuovo: non applicare la scelta del precedente
        fetch(url)
            .then(function(r) { return r.json(); })
            .then(function(j) { if (!cancelled && j) setChoice(j); })
            .catch(function() { /* backend giu' -> si resta ai default di Stremio */ });

        return function() { cancelled = true; };
    }, [metaId, kind]);

    // L'utente ha scelto: da ora comanda lui su tutto il titolo. Fire-and-forget:
    // se il POST fallisce si perde la memoria della scelta, non la scelta stessa
    // (che resta attiva nella sessione) -> mai bloccare la UI per questo.
    const remember = React.useCallback(function(patch) {
        const id = metaIdRef.current;
        if (!id) return;
        const url = casaBackendUrl('/title-language/' + encodeURIComponent(id));
        if (!url) return;
        fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch),
        }).catch(function() { /* best-effort */ });
        setChoice(function(prev) {
            return Object.assign({}, prev, patch, { source: 'user' });
        });
    }, []);

    return {
        audioLanguage: choice?.audio ?? null,
        subtitlesLanguage: choice?.subtitles ?? null,
        rememberAudioLanguage: React.useCallback(function(lang) {
            if (lang) remember({ audio: lang });
        }, [remember]),
        rememberSubtitlesLanguage: React.useCallback(function(lang) {
            if (lang) remember({ subtitles: lang });
        }, [remember]),
    };
};

module.exports = useCasaTitleLanguage;
