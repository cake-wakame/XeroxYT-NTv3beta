import type { Video, Channel } from '../types';
import { searchVideos, getRecommendedVideos } from './api';
import { extractKeywords } from './xrai';
import type { BlockedChannel, HiddenVideo } from '../contexts/PreferenceContext';

interface RecommendationSource {
    searchHistory: string[];
    watchHistory: Video[];
    subscribedChannels: Channel[];
    ngKeywords: string[];
    ngChannels: BlockedChannel[];
    hiddenVideos: HiddenVideo[];
    negativeKeywords: Map<string, number>;
    page: number;
}

const shuffleArray = <T,>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};

const cleanTitleForSearch = (title: string): string => {
    return title.replace(/【.*?】|\[.*?\]|\(.*?\)/g, '').trim().split(' ').slice(0, 4).join(' ');
};

export const getXraiRecommendations = async (sources: RecommendationSource): Promise<Video[]> => {
    const { 
        watchHistory, 
        subscribedChannels,
        ngKeywords,
        ngChannels,
        hiddenVideos,
        negativeKeywords
    } = sources;

    let seeds: string[] = [];
    
    if (watchHistory.length > 0) {
        const historySample = shuffleArray(watchHistory).slice(0, 10);
        seeds = historySample.map(v => `${cleanTitleForSearch(v.title)} related`);
    } else if (subscribedChannels.length > 0) {
        const subSample = shuffleArray(subscribedChannels).slice(0, 5);
        seeds = subSample.map(c => `${c.name} videos`);
    } else {
        seeds = ["Trending Japan", "Popular Music", "Gaming", "Cooking", "Vlog"];
    }

    const searchPromises = seeds.map(query => 
        searchVideos(query, '1').then(res => res.videos).catch(() => [])
    );
    
    const trendingPromise = getRecommendedVideos().then(res => res.videos).catch(() => []);

    const [nestedResults, trendingVideos] = await Promise.all([
        Promise.all(searchPromises),
        trendingPromise
    ]);
    
    let candidates = nestedResults.flat();
    
    if (trendingVideos.length > 0) {
        const selectedTrending = shuffleArray(trendingVideos).slice(0, 3);
        candidates.push(...selectedTrending);
    }

    const hiddenVideoIdsSet = new Set(hiddenVideos.map(v => v.id));
    const seenIds = new Set<string>(hiddenVideoIdsSet);
    candidates = candidates.filter(v => {
        if (seenIds.has(v.id)) return false;
        seenIds.add(v.id);
        return true;
    });

    if (watchHistory.length > 0) {
        const historyKeywords = new Set<string>();
        watchHistory.slice(0, 50).forEach(v => {
            extractKeywords(v.title).forEach(k => historyKeywords.add(k));
            extractKeywords(v.channelName).forEach(k => historyKeywords.add(k));
        });
        subscribedChannels.forEach(c => {
            extractKeywords(c.name).forEach(k => historyKeywords.add(k));
        });

        candidates = candidates.filter(candidate => {
            const titleKeywords = extractKeywords(candidate.title);
            const channelKeywords = extractKeywords(candidate.channelName);
            const isRelevant = [...titleKeywords, ...channelKeywords].some(k => historyKeywords.has(k));
            const isTrendingInjection = trendingVideos.some(tv => tv.id === candidate.id);
            return isRelevant || isTrendingInjection;
        });
    }

    const ngChannelIds = new Set(ngChannels.map(c => c.id));
    candidates = candidates.filter(v => {
        const fullText = `${v.title} ${v.channelName}`.toLowerCase();
        
        if (ngKeywords.some(ng => fullText.includes(ng.toLowerCase()))) return false;
        if (ngChannelIds.has(v.channelId)) return false;

        const vKeywords = [...extractKeywords(v.title), ...extractKeywords(v.channelName)];
        let negativeScore = 0;
        vKeywords.forEach(k => {
            if (negativeKeywords.has(k)) {
                negativeScore += (negativeKeywords.get(k) || 0);
            }
        });
        
        if (negativeScore > 2) return false;

        return true;
    });

    return shuffleArray(candidates);
};