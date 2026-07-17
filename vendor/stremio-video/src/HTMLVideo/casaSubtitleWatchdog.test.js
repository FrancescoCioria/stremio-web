// Test della decisione pura del watchdog subs (node, zero deps).
// Run: node vendor/stremio-video/src/HTMLVideo/casaSubtitleWatchdog.test.js
var wd = require('./casaSubtitleWatchdog');
var decideRepump = wd.decideRepump;

var failures = 0;
function assert(cond, msg) {
    if (!cond) { failures++; console.error('  FAIL: ' + msg); }
    else { console.log('  ok: ' + msg); }
}

// Helper: fa girare una serie di tick (ogni TICK reale = 2s, ma qui passiamo
// nowMs esplicito) e conta i repump. `supply(t)` ritorna maxEndMs dato il tempo.
function run(name, ticks) {
    var state = { lastRepumpAt: null, lastRepumpMaxEnd: null, staleCount: 0, backoffFrontMs: null };
    var repumps = [];
    ticks.forEach(function(s) {
        var d = decideRepump(state, s);
        if (d.repump) repumps.push({ t: s.timeMs, reason: d.reason });
    });
    return { repumps: repumps, state: state };
}

// Costruisce tick a passo 2s da timeMs0 a timeMs1, con maxEndMs dato da fn.
function ticksBetween(t0, t1, nowStart, maxEndFn, durMs) {
    var out = [];
    var now = nowStart;
    for (var t = t0; t <= t1; t += 2000) {
        var me = maxEndFn(t);
        out.push({ timeMs: t, durMs: durMs, cues: me != null && me > t ? 5 : 0, maxEndMs: me, playing: true, nowMs: now });
        now += 2000;
    }
    return out;
}

console.log('SCENARIO 1: regione sana (fronte ben avanti) -> nessun repump');
{
    var r = run('healthy', ticksBetween(1000000, 1050000, 0, function() { return 1160000; }, 2190040));
    assert(r.repumps.length === 0, 'zero repump quando ahead >= LOW_MS');
}

console.log('SCENARIO 2: drain reale (log Due Spicci EMBEDDED_4) -> UN repump quando ahead<6s');
{
    // fronte congelato a 1165800 mentre il playhead avanza da 1057726 a 1200000.
    var ticks = ticksBetween(1057726, 1201000, 0, function() { return 1165800; }, 2190040);
    var r = run('drain', ticks);
    assert(r.repumps.length >= 1, 'almeno un repump durante il drain');
    // Il primo repump deve scattare quando ahead scende sotto LOW_MS (6s):
    // maxEnd 1165800 - LOW 6000 = 1159800. Prima di li' niente.
    assert(r.repumps[0].t >= 1159000 && r.repumps[0].t <= 1167000, 'primo repump vicino al punto di esaurimento (~1160-1166k), era ' + (r.repumps[0] && r.repumps[0].t));
    // Qui il fronte NON cresce mai (finestra fissa) -> caso "no-help": cooldown +
    // back-off dopo MAX_STALE lo tengono bounded (1 iniziale + 4 stale = 5).
    assert(r.repumps.length <= 6, 'repump bounded da cooldown+backoff (<=6), erano ' + r.repumps.length);
}

console.log('SCENARIO 3: fix funziona (dopo repump arriva finestra nuova) -> torna sano, niente backoff');
{
    // Drain fino a 1165800; a t=1166000 il repump ha effetto: nuova finestra
    // fino a 1815880 (come nel log reale quando l'utente cambiava traccia).
    var ticks = ticksBetween(1057726, 1166000, 0, function() { return 1165800; }, 2190040)
        .concat(ticksBetween(1168000, 1250000, 60000, function() { return 1815880; }, 2190040));
    var r = run('recovers', ticks);
    assert(r.repumps.length >= 1 && r.repumps.length <= 3, 'repump durante il drain, poi stop quando torna sano (' + r.repumps.length + ')');
    assert(r.state.backoffFrontMs === null, 'nessun backoff se il fronte e\' ricresciuto');
    assert(r.state.staleCount === 0, 'staleCount azzerato dopo recupero');
}

console.log('SCENARIO 4: subs genuinamente finiti (fronte NON cresce mai) -> backoff, niente flip infinito');
{
    // Fronte fermo a 1165800 per sempre, il playhead continua. Ogni repump e'
    // inutile. Dopo MAX_STALE deve fermarsi (backoff) e NON ripartire finche' il
    // playhead non supera il fronte di REARM_AHEAD (30s).
    var ticks = ticksBetween(1057726, 1400000, 0, function() { return 1165800; }, 2190040);
    var r = run('exhausted', ticks);
    // MAX_STALE=4: al massimo ~5 repump (1 iniziale + 4 stale) prima del backoff.
    assert(r.repumps.length <= 6, 'i repump si fermano dopo il backoff (<=6), erano ' + r.repumps.length);
    assert(r.state.backoffFrontMs != null, 'backoff attivo su fronte esaurito');
    // Il playhead che avanza NON deve ri-armare (era il bug del flip infinito):
    // resta in backoff finche' non compaiono cue NUOVE oltre il fronte esaurito.
    var dStay = decideRepump(r.state, { timeMs: 1300000, durMs: 2190040, cues: 0, maxEndMs: 1165800, playing: true, nowMs: 999999999 });
    assert(dStay.repump === false && dStay.reason === 'backoff', 'il solo avanzare del playhead NON ri-arma (resta backoff)');
    // Supply RIPARTITA (fronte cresciuto oltre l'esaurito) -> ri-arma e ri-agisce.
    var dNew = decideRepump(r.state, { timeMs: 1300000, durMs: 2190040, cues: 5, maxEndMs: 1305000, playing: true, nowMs: 999999999 + 10000 });
    assert(r.state.backoffFrontMs === null, 're-arma quando arrivano cue nuove oltre il fronte esaurito');
}

console.log('SCENARIO 5: near-end -> mai repump (normale non avere piu\' cue)');
{
    var ticks = ticksBetween(2180000, 2189000, 0, function() { return 2185000; }, 2190040);
    var r = run('near-end', ticks);
    assert(r.repumps.length === 0, 'niente repump vicino alla fine del film');
}

console.log('SCENARIO 6: in pausa -> mai repump');
{
    var r = run('paused', [{ timeMs: 1200000, durMs: 2190040, cues: 0, maxEndMs: null, playing: false, nowMs: 0 }]);
    assert(r.repumps.length === 0, 'niente repump in pausa');
}

console.log('');
if (failures) { console.error(failures + ' ASSERZIONI FALLITE'); process.exit(1); }
console.log('TUTTO VERDE');
