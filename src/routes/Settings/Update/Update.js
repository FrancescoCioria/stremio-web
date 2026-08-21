// Copyright (C) 2017-2026 Smart code 203358507
//
// Sezione "Casa" di Settings: versione in chiaro + un pulsante che ricarica.
//
// Perche' un pulsante, visto che c'e' gia' l'aggiornamento automatico: dall'app
// installata (Mac) e dal kiosk (TV) il refresh del browser NON esiste, quindi
// quando qualcosa si incastra non c'e' nessun gesto di riserva. Il pulsante
// ricarica SEMPRE, anche a versione gia' aggiornata: e' proprio il caso in cui
// serve.
//
// ⚠️ Sta qui e non in Info: la sezione Info e' `display: none` sopra le
// dimensioni mobile (Info.less), quindi su TV e desktop non si vede.

const React = require('react');
const { Button } = require('stremio/components');
const { Section, Option } = require('../components');
const { CASA_VERSION } = require('stremio/casaVersion');
const casaUpdate = require('stremio/common/casaUpdate');

const Update = () => {
    const state = React.useSyncExternalStore(casaUpdate.subscribe, casaUpdate.getState);
    const busy = state.status === 'checking' || state.status === 'applying';

    const onClick = React.useCallback(() => { void casaUpdate.forceReload(); }, []);

    return (
        <Section label={'Casa'}>
            <Option label={'Versione'}>
                <div style={{ color: 'var(--primary-foreground-color)' }}>
                    {casaUpdate.updateStatusText(state, CASA_VERSION + ' · ' + String(process.env.COMMIT_HASH || '').slice(0, 7))}
                </div>
            </Option>
            <Option label={'Aggiornamento'}>
                <Button
                    className={'button'}
                    title={'Ricarica la tile con l\'ultimo bundle'}
                    disabled={busy}
                    onClick={onClick}
                >
                    {casaUpdate.updateButtonLabel(state.status)}
                </Button>
            </Option>
        </Section>
    );
};

module.exports = Update;
