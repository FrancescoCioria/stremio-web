// Copyright (C) 2017-2026 Smart code 203358507

// Cache chiave->valore che SOPRAVVIVE al reload, per dati che non cambiano
// (metadati di un film, voto di un titolo uscito l'anno scorso).
//
// ⚠️ Perche' non basta la Map in memoria: la tile resta aperta per giorni ma il
// bundle si ricarica ad ogni deploy, ad ogni aggiornamento automatico e ad ogni
// riapertura — e ogni volta si ricominciava da zero, cioe' l'utente rivedeva
// "carica quando ci passo sopra" su titoli gia' visti mille volte.
//
// ⚠️ **Con un tetto di voci, e non e' pedanteria**: il bucket `streams` del core
// vive nello stesso localStorage e cresce senza limite finche' la quota non si
// esaurisce; da li' in poi OGNI scrittura fallisce in silenzio. Una cache che
// cresce a piacere farebbe la stessa fine e si porterebbe dietro anche il core.
//
// ⚠️ Ogni accesso e' in try/catch: in navigazione privata, con i cookie di terze
// parti bloccati o in un contesto senza storage, `localStorage` non lancia
// "undefined", lancia. Il fallimento deve costare una cache mancata, non una
// schermata bianca.

const now = () => Date.now();

// Decisione pura (testabile): quali voci sopravvivono a un salvataggio.
// Tiene le piu' RECENTI: una cache piena di roba vecchia e' peggio di una vuota,
// perche' occupa la quota senza mai essere letta.
const pruneEntries = (entries, maxEntries, ttlMs, at) => {
    return entries
        .filter(([, v]) => v && typeof v.t === 'number' && at - v.t < ttlMs)
        .sort((a, b) => b[1].t - a[1].t)
        .slice(0, maxEntries);
};

class PersistentCache {
    constructor(name, { ttlMs, maxEntries }) {
        this.key = 'casa-cache:' + name;
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
        this.map = new Map();
        this.dirty = false;
        this.flushTimer = null;
        this.load();
    }

    load() {
        try {
            const raw = window.localStorage.getItem(this.key);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;
            for (const [k, v] of pruneEntries(Object.entries(parsed), this.maxEntries, this.ttlMs, now())) {
                this.map.set(k, v);
            }
        } catch (_e) {
            // storage assente/illeggibile: si parte a freddo, non e' un errore.
        }
    }

    get(key) {
        const hit = this.map.get(key);
        if (!hit) return null;
        if (now() - hit.t >= this.ttlMs) {
            this.map.delete(key);
            return null;
        }
        return hit.v;
    }

    set(key, value) {
        this.map.set(key, { t: now(), v: value });
        this.dirty = true;
        // Scrittura raggruppata: durante il prefetch della home arrivano decine
        // di `set` in pochi secondi, e serializzare ogni volta bloccherebbe il
        // thread proprio mentre la UI sta disegnando.
        if (this.flushTimer === null) {
            this.flushTimer = setTimeout(() => this.flush(), 2000);
        }
    }

    flush() {
        this.flushTimer = null;
        if (!this.dirty) return;
        this.dirty = false;
        try {
            const kept = pruneEntries([...this.map.entries()], this.maxEntries, this.ttlMs, now());
            this.map = new Map(kept);
            window.localStorage.setItem(this.key, JSON.stringify(Object.fromEntries(kept)));
        } catch (_e) {
            // Quota piena o storage negato: si continua con la sola memoria.
        }
    }
}

module.exports = { PersistentCache, pruneEntries };
