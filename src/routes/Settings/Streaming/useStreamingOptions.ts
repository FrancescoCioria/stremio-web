// Copyright (C) 2017-2023 Smart code 203358507

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { deepEqual } from 'fast-equals';
import { useCore } from 'stremio/core';

type TorrentProfile = {
    btDownloadSpeedHardLimit: number,
    btDownloadSpeedSoftLimit: number,
    btHandshakeTimeout: number,
    btMaxConnections: number,
    btMinPeersForStable: number,
    btRequestTimeout: number
};

const TORRENT_PROFILES: Record<string, TorrentProfile> = {
    default: {
        btDownloadSpeedHardLimit: 3670016,
        btDownloadSpeedSoftLimit: 2621440,
        btHandshakeTimeout: 20000,
        btMaxConnections: 55,
        btMinPeersForStable: 5,
        btRequestTimeout: 4000
    },
    soft: {
        btDownloadSpeedHardLimit: 1677721.6,
        btDownloadSpeedSoftLimit: 1677721.6,
        btHandshakeTimeout: 20000,
        btMaxConnections: 35,
        btMinPeersForStable: 5,
        btRequestTimeout: 4000
    },
    fast: {
        btDownloadSpeedHardLimit: 39321600,
        btDownloadSpeedSoftLimit: 4194304,
        btHandshakeTimeout: 20000,
        btMaxConnections: 200,
        btMinPeersForStable: 10,
        btRequestTimeout: 4000
    },
    'ultra fast': {
        btDownloadSpeedHardLimit: 78643200,
        btDownloadSpeedSoftLimit: 8388608,
        btHandshakeTimeout: 25000,
        btMaxConnections: 400,
        btMinPeersForStable: 10,
        btRequestTimeout: 6000
    }
};

const useStreamingOptions = (streamingServer: StreamingServer) => {
    const core = useCore();
    const { t } = useTranslation();
    // TODO combine those useMemo in one

    const settings = useMemo(() => (
        streamingServer?.settings?.type === 'Ready' ?
            streamingServer.settings.content as StreamingServerSettings : null
    ), [streamingServer.settings]);

    const networkInfo = useMemo(() => (
        streamingServer?.networkInfo?.type === 'Ready' ?
            streamingServer.networkInfo.content as NetworkInfo : null
    ), [streamingServer.networkInfo]);

    const deviceInfo = useMemo(() => (
        streamingServer?.deviceInfo?.type === 'Ready' ?
            streamingServer.deviceInfo.content as DeviceInfo : null
    ), [streamingServer.deviceInfo]);

    const streamingServerRemoteUrlInput = useMemo(() => ({
        value: streamingServer.remoteUrl,
    }), [streamingServer.remoteUrl]);

    const remoteEndpointSelect = useMemo(() => {
        if (!settings || !networkInfo) {
            return null;
        }

        return {
            options: [
                {
                    label: t('SETTINGS_DISABLED'),
                    value: '',
                },
                ...networkInfo.availableInterfaces.map((address) => ({
                    label: address,
                    value: address,
                }))
            ],
            value: settings.remoteHttps,
            onSelect: (value: string | null) => {
                core.transport.dispatch({
                    action: 'StreamingServer',
                    args: {
                        action: 'UpdateSettings',
                        args: {
                            ...settings,
                            remoteHttps: value,
                        }
                    }
                });
            }
        };
    }, [settings, networkInfo]);

    // Casa: slider 0-60GB step 5 al posto del dropdown [0/2/5/10/inf]. Il valore
    // (cacheSize di server.js) e' anche il TETTO reale della disk-cache di
    // TorrServer: lo legge il prune `torrserver-cache-prune.py` (values.cacheSize).
    // Vedi docs/stremio-torrserver.md. onChange scrive su server.js come il vecchio
    // select; il componente CacheSizeSlider gestisce debounce + stato locale.
    const cacheSizeSlider = useMemo(() => {
        if (!settings) {
            return null;
        }

        return {
            value: settings.cacheSize as number | null,
            onChange: (bytes: number) => {
                core.transport.dispatch({
                    action: 'StreamingServer',
                    args: {
                        action: 'UpdateSettings',
                        args: {
                            ...settings,
                            cacheSize: bytes,
                        }
                    }
                });
            }
        };
    }, [settings]);

    const torrentProfileSelect = useMemo(() => {
        if (!settings) {
            return null;
        }

        const selectedTorrentProfile = {
            btDownloadSpeedHardLimit: settings.btDownloadSpeedHardLimit,
            btDownloadSpeedSoftLimit: settings.btDownloadSpeedSoftLimit,
            btHandshakeTimeout: settings.btHandshakeTimeout,
            btMaxConnections: settings.btMaxConnections,
            btMinPeersForStable: settings.btMinPeersForStable,
            btRequestTimeout: settings.btRequestTimeout
        };
        const isCustomTorrentProfileSelected = Object.values(TORRENT_PROFILES).every((torrentProfile) => {
            return !deepEqual(torrentProfile, selectedTorrentProfile);
        });
        return {
            options: Object.keys(TORRENT_PROFILES)
                .map((profileName) => ({
                    label: t('TORRENT_PROFILE_' + profileName.replace(' ', '_').toUpperCase()),
                    value: JSON.stringify(TORRENT_PROFILES[profileName])
                }))
                .concat(
                    isCustomTorrentProfileSelected ?
                        [{
                            label: 'custom',
                            value: JSON.stringify(selectedTorrentProfile)
                        }]
                        :
                        []
                ),
            value: JSON.stringify(selectedTorrentProfile),
            onSelect: (value: any) => {
                core.transport.dispatch({
                    action: 'StreamingServer',
                    args: {
                        action: 'UpdateSettings',
                        args: {
                            ...settings,
                            ...JSON.parse(value),
                        }
                    }
                });
            }
        };
    }, [settings]);

    const transcodingProfileSelect = useMemo(() => {
        if (!settings || !deviceInfo) {
            return null;
        }

        return {
            options: [
                {
                    label: t('SETTINGS_DISABLED'),
                    value: null,
                },
                ...deviceInfo.availableHardwareAccelerations.map((name) => ({
                    label: name,
                    value: name,
                }))
            ],
            value: settings.transcodeProfile,
            onSelect: (value: string | null) => {
                core.transport.dispatch({
                    action: 'StreamingServer',
                    args: {
                        action: 'UpdateSettings',
                        args: {
                            ...settings,
                            transcodeProfile: value,
                        }
                    }
                });
            }
        };
    }, [settings, deviceInfo]);

    return {
        streamingServerRemoteUrlInput,
        remoteEndpointSelect,
        cacheSizeSlider,
        torrentProfileSelect,
        transcodingProfileSelect,
    };
};

export default useStreamingOptions;
