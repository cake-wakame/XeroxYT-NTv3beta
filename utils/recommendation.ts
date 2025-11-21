
import type { Video, Channel } from '../types';
import { searchVideos, getVideoDetails, getChannelVideos, getRecommendedVideos } from './api';
import { buildUserProfile, rankVideos, inferTopInterests, type UserProfile } from './xrai';

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

/**
 * Mixes two video lists based on a target ratio for List A (Discovery).
 * Ensures duplicates are removed and the ratio is strictly enforced as long as items exist.
 */
const mixFeeds = (discoveryList: Video[], comfortList: Video[], discoveryRatio: number): Video[] => {
    const result: Video[] = [];
    const seenIds = new Set<string>();

    let idxA = 0;
    let idxB = 0;
    
    const totalLength = discoveryList.length + comfortList.length;
    
    for (let i = 0; i < totalLength; i++) {
        const currentCountA = result.filter(v => discoveryList.includes(v)).length;
        const currentTotal = result.length + 1;
        
        let pickFromA = false;

        if (idxA < discoveryList.length && idxB < comfortList.length) {
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

    // 1. Build User Interest Profile (Vector Construction)
    const userProfile = buildUserProfile({
        watchHistory,
        searchHistory,
        subscribedChannels,
    });
    
    // 2. Infer Latent Interests (Deep Thinking)
    // Extract the top concepts that define this user.
    const inferredTopics = inferTopInterests(userProfile, 8);
    
    // ============================================================
    // POOL A: DISCOVERY & TRENDING (Target: 65%)
    // ============================================================
    
    const discoveryPromises: Promise<Video[]>[] = [];

    // Strategy A: "Active Inference Search"
    // Search for inferred topics combined with "New" or "Trending" intent.
    // We avoid generic "trending" and stick to "Topic + Intent" to ensure relevance.
    
    // Combine explicit genres with inferred topics
    const activeTopics = Array.from(new Set([...preferredGenres, ...inferredTopics])).slice(0, 6);

    if (activeTopics.length > 0) {
        // Chunk 1: "New" content for topics (Freshness focus)
        // We process topics in pairs to reduce API calls but maintain query density
        for (let i = 0; i < activeTopics.length; i += 2) {
            const topicsChunk = activeTopics.slice(i, i + 2);
            if (topicsChunk.length === 0) continue;
            
            // Query: "(TopicA OR TopicB)" - we rely on rankVideos to sort by velocity/freshness
            const query = `(${topicsChunk.join(' OR ')})`;
            
            discoveryPromises.push(
                searchVideos(query, String(page)) 
                    .then(res => res.videos)
                    .catch(() => [])
            );
        }
    }

    // Strategy B: "Cold Start / Fallback"
    // Only if profile is thin, look for generic Japanese trending
    if (activeTopics.length === 0 && page === 1) {
        discoveryPromises.push(
            searchVideos("Japan trending", '1')
                .then(res => res.videos)
                .catch(() => [])
        );
    }

    // ============================================================
    // POOL B: COMFORT & HISTORY (Target: 35%)
    // ============================================================

    const comfortPromises: Promise<Video[]>[] = [];

    // Strategy C: "Rabbit Hole" (Related to recent history)
    if (watchHistory.length > 0) {
        // Pick a random video from last 8 watched (increased scope)
        const recentVideo = watchHistory[Math.floor(Math.random() * Math.min(watchHistory.length, 8))];
        comfortPromises.push(
            getVideoDetails(recentVideo.id)
                .then(details => (details.relatedVideos || [])) 
                .catch(() => [])
        );
    }

    // Strategy D: "Subscriptions Feed"
    if (subscribedChannels.length > 0) {
        const randomSubs = shuffleArray(subscribedChannels).slice(0, 3);
        randomSubs.forEach(sub => {
            comfortPromises.push(
                getChannelVideos(sub.id)
                    .then(res => res.videos.slice(0, 10))
                    .catch(() => [])
            );
        });
    }
    
    // Fallback
    if (discoveryPromises.length === 0 && comfortPromises.length === 0) {
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

    // Filter Comfort: Remove if present in Discovery (Discovery takes precedence for freshness)
    const discoveryIds = new Set(uniqueDiscovery.map(v => v.id));
    const filteredComfort = uniqueComfort.filter(v => !discoveryIds.has(v.id));

    // Rank using XRAI Vector Engine
    
    // Rank Discovery: Focus on Velocity (Trending) & Relevance (Cosine Sim)
    const rankedDiscovery = rankVideos(uniqueDiscovery, userProfile, {
        ngKeywords: sources.ngKeywords,
        ngChannels: sources.ngChannels,
        watchHistory: sources.watchHistory,
        mode: 'discovery' // Enables velocity boost
    });

    // Rank Comfort: Focus on Pure Relevance & Channel Affinity
    const rankedComfort = rankVideos(filteredComfort, userProfile, {
        ngKeywords: sources.ngKeywords,
        ngChannels: sources.ngChannels,
        watchHistory: sources.watchHistory,
        mode: 'comfort'
    });

    // --- Final Mixing (65% Discovery) ---
    const finalFeed = mixFeeds(rankedDiscovery, rankedComfort, 0.65);

    return finalFeed.slice(0, 100); // Return top 100
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
