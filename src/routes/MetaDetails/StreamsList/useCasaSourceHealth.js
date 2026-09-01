// Copyright (C) 2017-2026 Smart code 203358507

// Casa: quando la lista delle sorgenti e' vuota, chiede al backend QUALE delle
// due cose e' successa.
//
// ⚠️ Il difetto che risolve (2026-09-01): Torrentio ha risposto 502 per ore e la
// casa ha mostrato "No streams were found" su OGNI titolo — Shawshank compreso.
// Dal divano si legge "questa serie non c'e'", e infatti e' quello che e'
// sembrato: la domanda arrivata e' stata "non vedo nessun torrent per questa
// serie, possibile?". Le due situazioni hanno esiti opposti (una si aspetta,
// l'altra si cerca altrove) e la UI le mostrava identiche.

const React = require('react');
const { casaBackendUrl } = require('stremio/common/casaBackend');

// Oltre questa eta' l'ultimo esito non descrive piu' "adesso": meglio non dire
// niente che dire una cosa vecchia con l'aria di essere attuale.
const FRESH_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 4000;

// enabled: si interroga solo quando serve davvero (lista vuota), non ad ogni
// apertura di una pagina che le sorgenti ce l'ha.
// key: identita' del contenuto a schermo (film o episodio).
// ⚠️ La `key` serve perche' il verdetto e' di UN ISTANTE: se `enabled` resta
// true passando da un titolo vuoto a un altro, l'effetto non rigira e a schermo
// resta il giudizio vecchio — la tile direbbe "le sorgenti non rispondono"
// quando invece rispondono.
// ⚠️ Nota di metodo: il controllo negativo dell'e2e che me l'ha fatto notare era
// **rotto** (riscriveva la route nello stesso context di Playwright e serviva
// comunque la prima risposta), quindi accusava il prodotto per un difetto
// dell'harness. Rifatto con due browser separati: fonte giu' -> messaggio nuovo,
// fonte ok -> messaggio standard. La `key` resta perche' e' giusta di suo, non
// perche' quel test l'avesse dimostrata.
const useCasaSourceHealth = (enabled, key) => {
    const [health, setHealth] = React.useState(null);
    React.useEffect(() => {
        if (!enabled) {
            setHealth(null);
            return undefined;
        }
        let cancelled = false;
        setHealth(null);
        const url = casaBackendUrl('/stremio-addon/source-health');
        if (!url) return undefined;
        fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
            .then((res) => (res.ok ? res.json() : null))
            .then((body) => {
                if (cancelled || !body || typeof body.ok !== 'boolean') return;
                const fresh = typeof body.at === 'number' && Date.now() - body.at < FRESH_MS;
                setHealth(fresh ? body : null);
            })
            .catch(() => {
                // Backend irraggiungibile: nessun messaggio in piu', si resta
                // sulla schermata standard.
            });
        return () => { cancelled = true; };
    }, [enabled, key]);
    return health;
};

module.exports = useCasaSourceHealth;
