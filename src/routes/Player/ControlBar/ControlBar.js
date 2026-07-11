// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { default: Icon } = require('@stremio/stremio-icons/react');
const { Button } = require('stremio/components');
const SeekBar = require('./SeekBar');
const styles = require('./styles');
const { t } = require('i18next');

const ControlBar = React.forwardRef(({
    className,
    paused,
    time,
    duration,
    buffered,
    subtitlesTracks,
    audioTracks,
    nextVideo,
    stream,
    statistics,
    onPlayRequested,
    onPauseRequested,
    onNextVideoRequested,
    onSeekRequested,
    onToggleSubtitlesMenu,
    onToggleAudioMenu,
    onToggleStatisticsMenu,
    onTouchEnd,
    tvNavMode,
    ...props
}, ref) => {
    const onSubtitlesButtonMouseDown = React.useCallback((event) => {
        event.nativeEvent.subtitlesMenuClosePrevented = true;
    }, []);
    const onAudioButtonMouseDown = React.useCallback((event) => {
        event.nativeEvent.audioMenuClosePrevented = true;
    }, []);
    const onStatisticsButtonMouseDown = React.useCallback((event) => {
        event.nativeEvent.statisticsMenuClosePrevented = true;
    }, []);
    const onPlayPauseButtonClick = React.useCallback(() => {
        if (paused) {
            if (typeof onPlayRequested === 'function') {
                onPlayRequested();
            }
        } else {
            if (typeof onPauseRequested === 'function') {
                onPauseRequested();
            }
        }
    }, [paused, onPlayRequested, onPauseRequested]);
    const onNextVideoButtonClick = React.useCallback(() => {
        if (nextVideo !== null && typeof onNextVideoRequested === 'function') {
            onNextVideoRequested();
        }
    }, [nextVideo, onNextVideoRequested]);
    return (
        <div ref={ref} {...props} onTouchStart={props.onMouseOver} onTouchMove={props.onMouseMove} onTouchEnd={onTouchEnd} className={classnames(className, styles['control-bar-container'])}>
            <SeekBar
                className={classnames(styles['seek-bar'], { [styles['seekbar-focused']]: tvNavMode === 'seekbar' })}
                time={time}
                duration={duration}
                buffered={buffered}
                onSeekRequested={onSeekRequested}
            />
            <div className={styles['control-bar-buttons-container']} data-tv-buttons-row="1">
                <Button className={classnames(styles['control-bar-button'], { 'disabled': typeof paused !== 'boolean' })} title={paused ? t('PLAYER_PLAY') : t('PLAYER_PAUSE')} tabIndex={0} onClick={onPlayPauseButtonClick} data-tv-button="play-pause">
                    <Icon className={styles['icon']} name={typeof paused !== 'boolean' || paused ? 'play' : 'pause'} />
                </Button>
                {
                    nextVideo !== null ?
                        <Button className={classnames(styles['control-bar-button'])} title={t('PLAYER_NEXT_VIDEO')} tabIndex={0} onClick={onNextVideoButtonClick} data-tv-button="next">
                            <Icon className={styles['icon']} name={'next'} />
                        </Button>
                        :
                        null
                }
                <Button className={classnames(styles['control-bar-button'], { 'disabled': !Array.isArray(subtitlesTracks) || subtitlesTracks.length === 0 })} title={t('PLAYER_SUBTITLES')} tabIndex={0} onMouseDown={onSubtitlesButtonMouseDown} onClick={onToggleSubtitlesMenu} data-tv-button="subtitles">
                    <Icon className={styles['icon']} name={'subtitles'} />
                </Button>
                <Button className={classnames(styles['control-bar-button'], { 'disabled': !Array.isArray(audioTracks) || audioTracks.length === 0 })} title={t('PLAYER_AUDIO')} tabIndex={0} onMouseDown={onAudioButtonMouseDown} onClick={onToggleAudioMenu} data-tv-button="audio">
                    <Icon className={styles['icon']} name={'audio-tracks'} />
                </Button>
                {/* Casa: gate su `statistics.infoHash` (useStatistics lo ricava dall'url
                    /ts per gli stream TorrServer, o da stream.infoHash per i torrent
                    classici). Prima era `stream.infoHash` + `stream.fileIdx`: campi che
                    i nostri stream HTTP non hanno -> il pulsante era SEMPRE disabilitato
                    da quando siamo passati a TorrServer, benche' le stats ci fossero. */}
                <Button className={classnames(styles['control-bar-button'], { 'disabled': statistics === null || typeof statistics.infoHash !== 'string' })} title={t('PLAYER_STATISTICS')} tabIndex={0} onMouseDown={onStatisticsButtonMouseDown} onClick={onToggleStatisticsMenu} data-tv-button="statistics">
                    <Icon className={styles['icon']} name={'network'} />
                </Button>
            </div>
        </div>
    );
});

ControlBar.propTypes = {
    className: PropTypes.string,
    paused: PropTypes.bool,
    time: PropTypes.number,
    duration: PropTypes.number,
    buffered: PropTypes.number,
    subtitlesTracks: PropTypes.array,
    audioTracks: PropTypes.array,
    nextVideo: PropTypes.object,
    stream: PropTypes.object,
    statistics: PropTypes.object,
    tvNavMode: PropTypes.string,
    onPlayRequested: PropTypes.func,
    onPauseRequested: PropTypes.func,
    onNextVideoRequested: PropTypes.func,
    onSeekRequested: PropTypes.func,
    onToggleSubtitlesMenu: PropTypes.func,
    onToggleAudioMenu: PropTypes.func,
    onToggleStatisticsMenu: PropTypes.func,
    onMouseOver: PropTypes.func,
    onMouseMove: PropTypes.func,
    onTouchEnd: PropTypes.func,
};

module.exports = ControlBar;
