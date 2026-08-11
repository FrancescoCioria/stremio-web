// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const { useCore } = require('stremio/core');

// hash + base TorrServer da un nostro url stream (.../stremio-addon/ts/<hash>/<idx>).
const torrserverOf = (url) => {
    const m = typeof url === 'string' && url.match(/\/ts\/([a-f0-9]{40})\b/i);
    if (!m) return null;
    try { const u = new URL(url); return { hash: m[1].toLowerCase(), base: u.protocol + '//' + u.hostname + ':8090' }; }
    catch (_e) { return null; }
};

const useStatistics = (player, streamingServer) => {
    const core = useCore();

    const [progress, setProgress] = React.useState(0);

    const stream = React.useMemo(() => {
        if (player.stream?.type === 'Ready') {
            return player.stream.content;
        } else {
            return null;
        }
    }, [player.stream]);

    // TorrServer: se lo stream e' un nostro url /ts, le stats vengono da TorrServer
    // (:8090), NON dal core :11470 (che non gestisce il torrent -> tutto 0). Il
    // download+transcode gira sul Beelink; il polling qui e' cross-origin (CORS *).
    const ts = React.useMemo(() => torrserverOf(stream?.url), [stream]);
    const [tsStats, setTsStats] = React.useState(null);
    React.useEffect(() => {
        if (!ts) { setTsStats(null); return; }
        let alive = true;
        const poll = () => {
            fetch(ts.base + '/torrents', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'get', hash: ts.hash })
            }).then((r) => (r && r.ok ? r.json() : null))
                .then((t) => { if (alive) setTsStats(t || null); })
                .catch(() => { /* tieni l'ultimo valore */ });
        };
        poll();
        const interval = setInterval(poll, 3000);
        return () => { alive = false; clearInterval(interval); };
    }, [ts]);

    // statistics dal core (:11470) per gli stream infoHash classici.
    const coreStats = React.useMemo(() => {
        return streamingServer.statistics?.type === 'Ready' ?
            streamingServer.statistics.content
            :
            null;
    }, [streamingServer.statistics]);

    const infoHash = React.useMemo(() => {
        if (ts) return ts.hash;
        return stream?.infoHash ? stream.infoHash : null;
    }, [ts, stream]);

    const peers = React.useMemo(() => {
        if (ts) return tsStats ? (+tsStats.active_peers || +tsStats.connected_seeders || 0) : 0;
        return coreStats?.peers ? coreStats.peers : 0;
    }, [ts, tsStats, coreStats]);

    const speed = React.useMemo(() => {
        const bps = ts ? (tsStats && tsStats.download_speed) : (coreStats && coreStats.downloadSpeed);
        return bps ? parseFloat((bps / 1000 / 1000).toFixed(2)) : 0;
    }, [ts, tsStats, coreStats]);

    // Byte davvero scaricati DALLO SWARM (utili, cioe' non duplicati) in QUESTA
    // sessione del torrent. E' la risposta a "Torr sta scaricando e quanto".
    // ⚠️ Per-sessione, NON un totale storico: quando TorrServer sgancia il torrent
    // (stat_string "Torrent in db", 30s dopo l'ultimo lettore) azzera i contatori.
    // ⚠️ Puo' restare a 0 mentre il film va benissimo: con `UseDisk` +
    // `RemoveCacheOnDrop:false` i pezzi restano su disco fra una sessione e
    // l'altra, quindi riguardare una parte gia' vista non scarica NIENTE.
    // Zero qui NON significa "TorrServer e' rotto".
    const downloaded = React.useMemo(() => {
        if (ts) return tsStats ? (+tsStats.bytes_read_useful_data || 0) : 0;
        return coreStats?.downloaded ? coreStats.downloaded : 0;
    }, [ts, tsStats, coreStats]);

    // % = frazione di file gia' in cache (preloaded/size).
    // ⚠️ NON e' progresso di download e NON e' una finestra davanti alla testina:
    // `preloaded_bytes` e' inchiodato alla dimensione della cache (6 GiB), quindi
    // su un film piu' grande resta COSTANTE (61,46% su 10,5 GB). Fino alla v4.46
    // Player.js ci derivava il "Buffer" mostrato all'utente: diceva 67m 54s mentre
    // il client aveva 18 secondi. Oggi il Buffer viene dal browser; questo campo
    // resta solo perche' e' il progresso vero per gli stream infoHash del core.
    const completed = React.useMemo(() => {
        if (ts) {
            const size = tsStats && +tsStats.torrent_size;
            const got = tsStats && +tsStats.preloaded_bytes;
            return size && got ? parseFloat(Math.min(100, (got / size) * 100).toFixed(2)) : 0;
        }
        return coreStats?.streamProgress ? parseFloat((coreStats.streamProgress * 100).toFixed(2)) : 0;
    }, [ts, tsStats, coreStats]);

    // Barra di caricamento (%). TorrServer: peer + velocita' + cache (non c'e' un
    // "downloaded" cumulativo). Core: la formula originale.
    React.useEffect(() => {
        const MB = 1024 * 1024;
        if (ts) {
            setProgress(() => {
                if (!tsStats) return 0;
                const peerScore = Math.min(1, (+tsStats.active_peers || 0) / 8) * 40;
                const speedScore = Math.min(1, (+tsStats.download_speed || 0) / (1 * MB)) * 41;
                const bufScore = Math.min(1, (+tsStats.preloaded_bytes || 0) / (16 * MB)) * 18;
                return Math.min(99, peerScore + speedScore + bufScore);
            });
            return;
        }
        coreStats && setProgress(() => {
            const peerScore = Math.min(1, coreStats.peers / 8) * 20;
            const minDownload = Math.min(8 * MB, Math.max(2 * MB, coreStats.streamLen * 0.008));
            const downloadedScore = Math.min(1, coreStats.downloaded / minDownload) * 70;
            const speedScore = Math.min(1, coreStats.downloadSpeed / (1 * MB)) * 10;
            return Math.min(99, peerScore + downloadedScore + speedScore);
        });
    }, [ts, tsStats, coreStats]);

    // GetStatistics dal core: solo per gli stream infoHash (i nostri url TorrServer no).
    const getStatistics = React.useCallback(() => {
        if (ts) return;
        if (stream) {
            const { infoHash, fileIdx } = stream;
            if (typeof infoHash === 'string' && typeof fileIdx === 'number') {
                core.transport.dispatch({
                    action: 'StreamingServer',
                    args: {
                        action: 'GetStatistics',
                        args: {
                            infoHash,
                            fileIdx,
                        }
                    }
                });
            }
        }
    }, [stream, ts]);

    React.useEffect(() => {
        getStatistics();
        const interval = setInterval(getStatistics, 5000);
        return () => clearInterval(interval);
    }, [getStatistics]);

    React.useEffect(() => {
        setProgress(infoHash ? 0 : 100);
    }, [infoHash]);

    return {
        infoHash,
        peers,
        speed,
        downloaded,
        completed,
        progress,
    };
};

module.exports = useStatistics;
