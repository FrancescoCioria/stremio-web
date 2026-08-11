// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const { useTranslation } = require('react-i18next');
const classNames = require('classnames');
const PropTypes = require('prop-types');
const styles = require('./styles.less');

// Buffer (ms) = minuti di video scaricati ≈ completed% * durata (calcolato
// in Player.js da downloaded/length del torrent). NON il buffer del media
// element del browser (HTMLVideo.js usa videoElement.buffered), che e'
// cappato e si congela in pausa; NON sottraiamo `time` perche' il server
// scarica una finestra attorno alla posizione, non sequenziale dall'inizio
// (completed e' frazione TOTALE scaricata, non posizionale). Cresce col
// download anche in pausa: indicatore di quanto e' bufferizzato.
const formatBuffer = (ms) => {
    if (ms === null || isNaN(ms)) return '--';
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${('0' + (s % 60)).slice(-2)}s`;
};

// Byte scaricati dallo swarm. Totale: mai NaN sullo schermo, e 0 si vede
// (e' informazione: TorrServer sta servendo dalla cache su disco).
const formatBytes = (bytes) => {
    if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) return '--';
    if (bytes >= 1000 * 1000 * 1000) return `${(bytes / 1000 / 1000 / 1000).toFixed(2)} GB`;
    return `${Math.round(bytes / 1000 / 1000)} MB`;
};

const StatisticsMenu = React.memo(React.forwardRef(({ className, peers, speed, downloaded, buffer, infoHash }, ref) => {
    const { t } = useTranslation();
    const onMouseDown = React.useCallback((event) => {
        event.nativeEvent.statisticsMenuClosePrevented = true;
    }, []);
    return (
        <div ref={ref} className={classNames(className, styles['statistics-menu-container'])} onMouseDown={onMouseDown}>
            <div className={styles['title']}>
                {t('PLAYER_STATISTICS')}
            </div>
            <div className={styles['stats']}>
                <div className={styles['stat']}>
                    <div className={styles['label']}>
                        {t('PLAYER_PEERS')}
                    </div>
                    <div className={styles['value']}>
                        { peers }
                    </div>
                </div>
                <div className={styles['stat']}>
                    <div className={styles['label']}>
                        {t('PLAYER_SPEED')}
                    </div>
                    <div className={styles['value']}>
                        {`${speed} ${t('MB_S')}`}
                    </div>
                </div>
                {/* "Completed %" rimosso: con TorrServer (streaming a finestra)
                    e' preloaded_bytes/torrent_size -> resta ~2% per sempre e non
                    sale mai a 100% (non e' un download cumulativo).
                    ⚠️ Dal 12/08/2026 "Buffer" NON si deriva piu' da `completed`:
                    `preloaded_bytes` e' inchiodato alla dimensione della cache, e
                    la riga mostrava "67m 54s" mentre il client aveva 18 secondi.
                    Ora e' il buffer vero del browser (casaClientBuffer.js). */}
                <div className={styles['stat']}>
                    <div className={styles['label']}>
                        {'Scaricato'}
                    </div>
                    <div className={styles['value']}>
                        { formatBytes(downloaded) }
                    </div>
                </div>
                <div className={styles['stat']}>
                    <div className={styles['label']}>
                        {'Buffer'}
                    </div>
                    <div className={styles['value']}>
                        { formatBuffer(buffer) }
                    </div>
                </div>
            </div>
            <div className={styles['info-hash']}>
                <div className={styles['label']}>
                    {t('PLAYER_INFO_HASH')}
                </div>
                <div className={styles['value']}>
                    { infoHash }
                </div>
            </div>
        </div>
    );
}));

StatisticsMenu.propTypes = {
    className: PropTypes.string,
    peers: PropTypes.number,
    speed: PropTypes.number,
    downloaded: PropTypes.number,
    buffer: PropTypes.number,
    infoHash: PropTypes.string,
};

module.exports = StatisticsMenu;
