// Copyright (C) 2017-2026 Smart code 203358507
//
// Auto-setup Casa: la tile si rimette a posto da sola quando il profilo del
// browser si resetta (cache svuotata a mano in un deploy, eviction del
// QuotaManager, profilo rifatto). Senza, riparte come OSPITE: library vuota,
// collezione addon dell'account persa (= niente Torrentio nostro, quindi zero
// sorgenti) e streaming server sul default. Dalla TV si rimediava rifacendo
// login e URL col telecomando, ogni volta.
//
// Due cose, entrambe UNA VOLTA PER CARICAMENTO PAGINA:
//   1. login, se non c'e' auth: token coniato dal backend (mai la chiave del
//      .env, vedi stremio_auth.ts) + `Authenticate/LoginWithToken`, la stessa
//      azione che il core espone per il login via token;
//   2. streaming server URL derivato dall'host della pagina.
//
// ⚠️ Una volta per caricamento, non "in continuo": chi apre Settings e cambia
// l'URL a mano deve poterlo fare senza che questo glielo riscriva sotto le dita.
// Stesso motivo per il login: se l'utente fa Logout resta sloggato fino al
// prossimo reload (e al reload rientra — e' esattamente cio' che vogliamo qui,
// la casa non ha una schermata di login da telecomando).
//
// ⚠️ L'URL si applica al mount E una seconda volta appena l'auth passa da
// null a non-null: non diamo per scontato che il core preservi le settings
// attraverso l'autenticazione. Costa un confronto di stringhe e toglie di mezzo
// un ordine di esecuzione su cui altrimenti si dovrebbe scommettere.

const React = require('react');
const { useCore } = require('stremio/core');
const { withCoreSuspender, useProfile } = require('stremio/common');
const { casaBackendUrl, casaBeacon } = require('stremio/common/casaBackend');
const { serverUrlUpdate } = require('stremio/common/casaAutoSetup');

const TOKEN_PATH = '/stremio-auth/token';
// Il backend puo' non essere ancora su quando la tile parte al boot del box.
const TOKEN_RETRIES = 3;
const TOKEN_RETRY_MS = 2000;

const report = (payload) => casaBeacon('/debug/player-event', Object.assign({ ev: 'casa-autosetup' }, payload));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchSessionToken = async () => {
    const url = casaBackendUrl(TOKEN_PATH);
    if (!url) return null;
    for (let attempt = 1; attempt <= TOKEN_RETRIES; attempt++) {
        try {
            const res = await fetch(url);
            if (res.ok) {
                const body = await res.json();
                if (body && typeof body.token === 'string' && body.token.length > 0) return body.token;
            }
            report({ step: 'token-failed', attempt, status: res.status });
        } catch (e) {
            report({ step: 'token-failed', attempt, error: String(e && e.message || e) });
        }
        if (attempt < TOKEN_RETRIES) await sleep(TOKEN_RETRY_MS);
    }
    return null;
};

const CasaAutoSetup = () => {
    const core = useCore();
    const profile = useProfile();

    const loginTriedRef = React.useRef(false);
    // 0 = mai applicato, 1 = applicato al mount, 2 = riapplicato dopo il login.
    const urlPhaseRef = React.useRef(0);
    const wasAuthedRef = React.useRef(profile.auth !== null);
    // profile in un ref: gli effetti sotto leggono le settings al momento del
    // dispatch, non quelle catturate alla creazione della closure.
    const profileRef = React.useRef(profile);
    profileRef.current = profile;

    const applyServerUrl = React.useCallback((phase) => {
        const settings = profileRef.current.settings;
        const target = serverUrlUpdate(settings, window.location.hostname);
        if (target === null) return;
        core.transport.dispatch({
            action: 'Ctx',
            args: {
                action: 'UpdateSettings',
                args: Object.assign({}, settings, { streamingServerUrl: target }),
            },
        });
        core.transport.dispatch({
            action: 'Ctx',
            args: { action: 'AddServerUrl', args: target },
        });
        report({ step: 'server-url-set', phase, url: target, was: settings && settings.streamingServerUrl });
    }, []);

    React.useEffect(() => {
        if (urlPhaseRef.current === 0) {
            urlPhaseRef.current = 1;
            applyServerUrl(1);
        }
    }, []);

    React.useEffect(() => {
        if (profile.auth !== null || loginTriedRef.current) return;
        loginTriedRef.current = true;
        report({ step: 'logged-out' });
        fetchSessionToken().then((token) => {
            if (!token) {
                report({ step: 'give-up' });
                return;
            }
            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'Authenticate',
                    args: { type: 'LoginWithToken', token },
                },
            });
            report({ step: 'login-dispatched' });
        });
    }, [profile.auth]);

    React.useEffect(() => {
        const authed = profile.auth !== null;
        const justLoggedIn = authed && !wasAuthedRef.current;
        wasAuthedRef.current = authed;
        if (!justLoggedIn) return;
        report({ step: 'authenticated' });
        if (urlPhaseRef.current < 2) {
            urlPhaseRef.current = 2;
            applyServerUrl(2);
        }
    }, [profile.auth]);

    return null;
};

module.exports = withCoreSuspender(CasaAutoSetup);
