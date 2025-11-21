
import type { Video, Channel } from '../types';
import { searchVideos, getVideoDetails, getChannelVideos, getRecommendedVideos } from './api';
import { buildUserProfile, rankVideos } from './xrai';

// --- Types ---

interface RecommendationSource {
    searchHistory: string[];
    watchHistory: Video[];
    subscribedChannels: Channel[];
    preferredGenres: string[];
    preferredChannels: string[];
    ngKeywords: string[];
    ngChannels: string[];
    page: number;
}

// --- Helpers ---

const shuffleArray = <T,>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};

// Helper to chunk array into smaller arrays
const chunkArray = <T,>(array: T[], size: number): T[][] => {
    const chunked: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
};

/**
 * Mixes two video lists based on a target ratio for List A (Discovery).
 * Ensures duplicates are removed and the ratio is strictly enforced as long as items exist.
 * 
 * @param discoveryList List A: New/Trending videos (Target: 65%)
 * @param comfortList List B: Subscriptions/History videos (Target: 35%)
 * @param discoveryRatio Target ratio for List A (0.0 - 1.0)
 */
const mixFeeds = (discoveryList: Video[], comfortList: Video[], discoveryRatio: number): Video[] => {
    const result: Video[] = [];
    const seenIds = new Set<string>();

    let idxA = 0;
    let idxB = 0;
    
    // Calculate cycle. For 65% (approx 2/3), we want pattern like: A, A, B, A, A, B...
    // If ratio is 0.65, out of 100 items, 65 are A, 35 are B. 
    // Simplified logic: Probabilistic insertion or bucket filling.
    
    const totalLength = discoveryList.length + comfortList.length;
    
    for (let i = 0; i < totalLength; i++) {
        // Determine which pool to pick from based on current ratio
        const currentCountA = result.filter(v => discoveryList.includes(v)).length;
        const currentTotal = result.length + 1; // predictive
        
        let pickFromA = false;

        if (idxA < discoveryList.length && idxB < comfortList.length) {
            // If both lists have items, decide based on ratio
            // If current ratio of A is less than target, pick A.
            if ((currentCountA / currentTotal) < discoveryRatio) {
                pickFromA = true;
            } else {
                pickFromA = false;
            }
        } else if (idxA < discoveryList.length) {
            pickFromA = true;
        } else {
            pickFromA = false;
        }

        let candidate: Video | undefined;

        if (pickFromA && idxA < discoveryList.length) {
            candidate = discoveryList[idxA++];
        } else if (idxB < comfortList.length) {
            candidate = comfortList[idxB++];
        }

        if (candidate && !seenIds.has(candidate.id)) {
            seenIds.add(candidate.id);
            result.push(candidate);
        }
    }
    
    return result;
};

// --- XRAI v3 Recommendation Engine ---

export const getXraiRecommendations = async (sources: RecommendationSource): Promise<Video[]> => {
    const { 
        watchHistory, 
        searchHistory, 
        subscribedChannels, 
        preferredGenres,
        page
    } = sources;

    // 1. Build User Interest Profile (Deep Learning Simulation)
    const userProfile = buildUserProfile({
        watchHistory,
        searchHistory,
        subscribedChannels,
    });
    
    // ============================================================
    // POOL A: DISCOVERY & TRENDING (Target: 65%)
    // ============================================================
    
    const discoveryPromises: Promise<Video[]>[] = [];

    // A-1. "Deep Search": Extract top keywords and OR-search them
    // This finds NEW videos that match OLD interests.
    const weightedKeywords = [...userProfile.keywords.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0]);
    
    // Mix in preferred genres
    const priorityKeywords = Array.from(new Set([...preferredGenres, ...weightedKeywords]));
    
    // Take top 12 keywords
    const topKeywords = priorityKeywords.slice(0, 12);
    
    if (topKeywords.length > 0) {
        // "A OR B OR C" strategy
        // Chunk keywords to create dense search queries
        const keywordChunks = chunkArray(topKeywords, 3); // 3 words per query
        
        keywordChunks.forEach(chunk => {
            // Add a random generic term occasionally to broaden discovery
            const query = chunk.join(' OR ');
            discoveryPromises.push(
                searchVideos(query, String(page)) // Use pagination to get "new" results on scroll
                    .then(res => res.videos)
                    .catch(() => [])
            );
        });
    }

    // A-2. "Trending/Fresh": Global trends or specific high-volume topics
    // We simulate trending by searching broad, high-volume terms
    if (page === 1) {
        discoveryPromises.push(
            searchVideos("trending OR viral OR new", '1')
                .then(res => res.videos)
                .catch(() => [])
        );
    } else {
        // On deeper pages, dig deeper into related concepts
        discoveryPromises.push(
             getRecommendedVideos()
                .then(res => res.videos)
                .catch(() => [])
        );
    }

    // ============================================================
    // POOL B: COMFORT & HISTORY (Target: 35%)
    // ============================================================

    const comfortPromises: Promise<Video[]>[] = [];

    // B-1. Related to recent history (The "Rabbit Hole")
    if (watchHistory.length > 0) {
        // Pick a random video from last 5 watched to get recommendations for
        const recentVideo = watchHistory[Math.floor(Math.random() * Math.min(watchHistory.length, 5))];
        comfortPromises.push(
            getVideoDetails(recentVideo.id)
                .then(details => (details.relatedVideos || [])) 
                .catch(() => [])
        );
    }

    // B-2. Subscriptions (The "Feed")
    if (subscribedChannels.length > 0) {
        // Pick random subs
        const randomSubs = shuffleArray(subscribedChannels).slice(0, 2);
        randomSubs.forEach(sub => {
            comfortPromises.push(
                getChannelVideos(sub.id)
                    .then(res => res.videos.slice(0, 8))
                    .catch(() => [])
            );
        });
    }
    
    // Fallback for new users
    if (watchHistory.length === 0 && subscribedChannels.length === 0 && topKeywords.length === 0) {
        discoveryPromises.push(getRecommendedVideos().then(res => res.videos));
    }


    // --- Execution & Ranking ---
    const [discoveryNested, comfortNested] = await Promise.all([
        Promise.all(discoveryPromises),
        Promise.all(comfortPromises)
    ]);

    const rawDiscovery = discoveryNested.flat();
    const rawComfort = comfortNested.flat();

    // Deduplicate locally
    const uniqueDiscovery = Array.from(new Map(rawDiscovery.map(v => [v.id, v])).values());
    const uniqueComfort = Array.from(new Map(rawComfort.map(v => [v.id, v])).values());

    // Remove overlaps: If it's in Discovery, keep it there. Remove from Comfort if present.
    const discoveryIds = new Set(uniqueDiscovery.map(v => v.id));
    const filteredComfort = uniqueComfort.filter(v => !discoveryIds.has(v.id));

    // Rank using XRAI (Neural Simulation)
    // We score Discovery videos aggressively on "Freshness" and "Relevance"
    const rankedDiscovery = rankVideos(uniqueDiscovery, userProfile, {
        ngKeywords: sources.ngKeywords,
        ngChannels: sources.ngChannels,
        watchHistory: sources.watchHistory,
        mode: 'discovery' // Tells ranker to favor fresh/new
    });

    // We score Comfort videos on "Relevance" and "Channel Affinity"
    const rankedComfort = rankVideos(filteredComfort, userProfile, {
        ngKeywords: sources.ngKeywords,
        ngChannels: sources.ngChannels,
        watchHistory: sources.watchHistory,
        mode: 'comfort'
    });

    // --- Final Mixing (65% Discovery) ---
    const finalFeed = mixFeeds(rankedDiscovery, rankedComfort, 0.65);

    // If we don't have enough, fill with whatever is left
    return finalFeed.slice(0, 150);
};


// --- Legacy Recommendation Engine ---

export const getLegacyRecommendations = async (): Promise<Video[]> => {
    try {
        const { videos } = await getRecommendedVideos();
        return shuffleArray(videos); 
    } catch (error) {
        console.error("Failed to fetch legacy recommendations:", error);
        return [];
    }
}
