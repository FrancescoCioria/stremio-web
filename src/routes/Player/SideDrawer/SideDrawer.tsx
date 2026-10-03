// Copyright (C) 2017-2024 Smart code 203358507

import React, { useMemo, useCallback, useState, useRef, forwardRef, memo } from 'react';
import classNames from 'classnames';
import Icon from '@stremio/stremio-icons/react';
import { CONSTANTS } from 'stremio/common';
import { MetaPreview, Video } from 'stremio/components';
import SeasonsBar from 'stremio/routes/MetaDetails/VideosList/SeasonsBar';
import useCasaSeriesVideos from 'stremio/routes/MetaDetails/useCasaSeriesVideos';
import styles from './SideDrawer.less';

type Props = {
    className?: string;
    seriesInfo: SeriesInfo;
    metaItem: MetaItem;
    libraryItem?: LibraryItem | null;
    closeSideDrawer: () => void;
    selected: string;
    transitionEnded: boolean;
};

// Casa: stagione/episodio da un id `tt123:S:E`. Il core ricava `seriesInfo` dai
// SOLI video di Cinemeta: in riproduzione su un episodio che Cinemeta non elenca
// (X Factor S20E04) era null e il menu non mostrava nessun episodio.
const seriesInfoFromVideoId = (id?: string): SeriesInfo | null => {
    const m = typeof id === 'string' ? id.match(/^tt\d+:(\d+):(\d+)$/) : null;
    return m ? { season: Number(m[1]), episode: Number(m[2]) } as SeriesInfo : null;
};

const SideDrawer = memo(forwardRef<HTMLDivElement, Props>(({ className, closeSideDrawer, selected, ...props }: Props, ref) => {
    const seriesInfo = props.seriesInfo ?? (props.metaItem?.type === 'series' ? seriesInfoFromVideoId(selected) : null);
    const [season, setSeason] = useState<number>(seriesInfo?.season);
    const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
    const videosRef = useRef<HTMLDivElement>(null);

    const metaItem = useMemo(() => {
        return seriesInfo ?
            {
                ...props.metaItem,
                links: props.metaItem.links.filter(({ category }) => category === CONSTANTS.SHARE_LINK_CATEGORY)
            }
            :
            props.metaItem;
    }, [props.metaItem]);
    // Casa: la STESSA lista unita della pagina serie (core + episodi che Cinemeta
    // non elenca ancora, useCasaSeriesVideos). Prima qui c'erano solo i video del
    // core: su X Factor S20 (Cinemeta = solo E01) E02-E04 non comparivano, e
    // "stagione vista" guardava E01 soltanto. Scritture: core via 'Player', righe
    // extra al backend.
    const casaSeries = useCasaSeriesVideos(seriesInfo ? props.metaItem : null, props.libraryItem ?? null, { model: 'Player', migrate: false });
    const allVideos: Video[] = seriesInfo ? casaSeries.videos : props.metaItem.videos;
    const videos = useMemo(() => {
        return Array.isArray(allVideos) ?
            allVideos.filter((video) => video.season === season)
            :
            allVideos;
    }, [allVideos, season]);
    const seasons = useMemo(() => {
        return allVideos
            .map(({ season }) => season)
            .filter((season, index, seasons) => {
                return seasons.indexOf(season) === index;
            })
            .sort((a, b) => (a || Number.MAX_SAFE_INTEGER) - (b || Number.MAX_SAFE_INTEGER));
    }, [allVideos]);

    const seasonOnSelect = useCallback((event: { value: string | number }) => {
        setSeason(parseInt(String(event.value), 10));
        videosRef.current?.scrollTo({ top: 0, left: 0 });
    }, []);

    const seasonWatched = React.useMemo(() => {
        return videos.every((video) => video.watched);
    }, [videos]);

    const onMouseDown = (event: React.MouseEvent) => {
        event.stopPropagation();
    };

    const onTransitionEnd = useCallback(() => {
        setSelectedVideoId(selected);
    }, [selected]);

    return (
        <div ref={ref} className={classNames(styles['side-drawer'], className)} onMouseDown={onMouseDown} onTransitionEnd={onTransitionEnd}>
            <div className={styles['close-button']} onClick={closeSideDrawer}>
                <Icon className={styles['icon']} name={'chevron-forward'} />
            </div>
            <div className={styles['info']}>
                <MetaPreview
                    className={styles['side-drawer-meta-preview']}
                    compact={true}
                    name={metaItem.name}
                    logo={metaItem.logo}
                    runtime={metaItem.runtime}
                    releaseInfo={metaItem.releaseInfo}
                    released={metaItem.released}
                    description={metaItem.description}
                    links={metaItem.links}
                />
            </div>
            {
                seriesInfo ?
                    <div className={styles['series-content']}>
                        <SeasonsBar
                            season={season}
                            seasons={seasons}
                            onSelect={seasonOnSelect}
                        />
                        <div ref={videosRef} className={styles['videos']}>
                            {videos.map((video, index) => (
                                <Video
                                    key={index}
                                    className={styles['video']}
                                    id={video.id}
                                    title={video.title}
                                    thumbnail={video.thumbnail}
                                    season={video.season}
                                    episode={video.episode}
                                    released={video.released}
                                    upcoming={video.upcoming}
                                    watched={video.watched}
                                    seasonWatched={seasonWatched}
                                    progress={video.progress}
                                    deepLinks={video.deepLinks}
                                    scheduled={video.scheduled}
                                    selected={video.id === selectedVideoId}
                                    onMarkVideoAsWatched={casaSeries.markVideo}
                                    onMarkSeasonAsWatched={casaSeries.markSeason}
                                />
                            ))}
                        </div>
                    </div>
                    : null
            }

        </div>
    );
}));

export default SideDrawer;
