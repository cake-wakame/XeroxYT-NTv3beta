
import type { Video, Channel } from '../types';

// --- Types ---

interface UserProfile {
  keywords: Map<string, number>; // The "User Vector"
}

interface UserSources {
  watchHistory: Video[];
  searchHistory: string[];
  subscribedChannels: Channel[];
}

interface ScoringContext {
  ngKeywords: string[];
  ngChannels: string[];
  watchHistory: Video[];
  mode?: 'discovery' | 'comfort';
}

// --- Keyword Extraction (Tokenizer Simulation) ---

const JAPANESE_STOP_WORDS = new Set([
  'の', 'に', 'は', 'を', 'が', 'で', 'です', 'ます', 'こと', 'もの', 'これ', 'それ', 'あれ',
  'いる', 'する', 'ある', 'ない', 'から', 'まで', 'と', 'も', 'や', 'など', 'さん', 'ちゃん',
  'about', 'and', 'the', 'to', 'a', 'of', 'in', 'for', 'on', 'with', 'as', 'at', 'movie', 'video'
]);

// Explicitly cast Intl to any for safety
const segmenter = (typeof Intl !== 'undefined' && (Intl as any).Segmenter) 
    ? new (Intl as any).Segmenter('ja', { granularity: 'word' }) 
    : null;

const extractKeywords = (text: string): string[] => {
  if (!text) return [];
  const cleanedText = text.toLowerCase();
  
  let words: string[] = [];

  if (segmenter) {
      const segments = segmenter.segment(cleanedText);
      for (const segment of segments) {
          if (segment.isWordLike) {
              words.push(segment.segment);
          }
      }
  } else {
      words = cleanedText
        .replace(/[\p{S}\p{P}\p{Z}\p{C}]/gu, ' ')
        .split(/\s+/)
        .filter(w => w.length > 0);
  }

  const keywords = words.filter(word => {
    if (word.length <= 1 && !/^[a-zA-Z0-9]$/.test(word)) return false;
    if (JAPANESE_STOP_WORDS.has(word)) return false;
    if (/^\d+$/.test(word)) return false; 
    return true;
  });

  return Array.from(new Set(keywords));
};

// --- User Profile Builder (Vector Construction) ---

export const buildUserProfile = (sources: UserSources): UserProfile => {
  const keywords = new Map<string, number>();

  const addKeywords = (text: string, weight: number) => {
    extractKeywords(text).forEach(kw => {
      // Accumulate weights (Vector addition)
      keywords.set(kw, (keywords.get(kw) || 0) + weight);
    });
  };

  // 1. Search History (High Intent)
  sources.searchHistory.slice(0, 30).forEach((term, index) => {
    // Exponential decay: recent searches are much more important
    const weight = 8.0 * Math.exp(-index / 8); 
    addKeywords(term, weight);
  });

  // 2. Watch History (Implicit Interest)
  sources.watchHistory.slice(0, 100).forEach((video, index) => {
    const weight = 4.0 * Math.exp(-index / 20);
    addKeywords(video.title, weight);
    addKeywords(video.channelName, weight * 1.5); 
  });

  // 3. Subscriptions (Long-term Affinity)
  sources.subscribedChannels.forEach(channel => {
    addKeywords(channel.name, 3.0);
  });
  
  return { keywords };
};

// --- Parsing Helpers ---

const parseUploadedAt = (uploadedAt: string): number => {
    if (!uploadedAt) return 999;
    const text = uploadedAt.toLowerCase();
    const numMatch = text.match(/(\d+)/);
    const num = numMatch ? parseInt(numMatch[1], 10) : 0;

    // Convert everything to "Days ago" approximation
    if (text.includes('分前') || text.includes('minute')) return 0;
    if (text.includes('時間前') || text.includes('hour')) return 0.1;
    if (text.includes('日') || text.includes('day')) return num;
    if (text.includes('週') || text.includes('week')) return num * 7;
    if (text.includes('月') || text.includes('month')) return num * 30;
    if (text.includes('年') || text.includes('year')) return num * 365;
    return 999; 
};

const parseViews = (viewsStr: string): number => {
    if (!viewsStr) return 0;
    let mult = 1;
    if (viewsStr.includes('万')) mult = 10000;
    else if (viewsStr.includes('億')) mult = 100000000;
    else if (viewsStr.toUpperCase().includes('K')) mult = 1000;
    else if (viewsStr.toUpperCase().includes('M')) mult = 1000000;
    else if (viewsStr.toUpperCase().includes('B')) mult = 1000000000;

    const numMatch = viewsStr.match(/(\d+(\.\d+)?)/);
    if (!numMatch) return 0;
    return parseFloat(numMatch[1]) * mult;
}

// --- Deep Learning Simulation Ranker ---

export const rankVideos = (
  videos: Video[],
  userProfile: UserProfile,
  context: ScoringContext
): Video[] => {
  const scoredVideos: { video: Video; score: number }[] = [];
  const seenIds = new Set<string>(context.watchHistory.map(v => v.id));

  for (const video of videos) {
    if (!video || !video.id) continue;
    
    const fullText = `${video.title} ${video.channelName} ${video.descriptionSnippet || ''}`.toLowerCase();
    
    // 1. Negative Filtering
    if (context.ngKeywords.some(ng => fullText.includes(ng.toLowerCase()))) continue;
    if (context.ngChannels.includes(video.channelId)) continue;
    
    // 2. History Penalty (Demote watched videos)
    // If discovery mode, penalize heavily. If comfort mode, allow re-watch slightly.
    let historyPenalty = 1.0;
    if (seenIds.has(video.id)) {
        historyPenalty = context.mode === 'discovery' ? 0.01 : 0.2; 
    }

    // 3. Semantic Relevance (Vector Dot Product Simulation)
    let relevanceScore = 0;
    const videoKeywords = extractKeywords(fullText);
    
    // Calculate coverage: How many of the video's words match user interests?
    let matchCount = 0;
    videoKeywords.forEach(kw => {
      if (userProfile.keywords.has(kw)) {
        relevanceScore += userProfile.keywords.get(kw)!;
        matchCount++;
      }
    });

    // Normalize by length to prevent long titles from always winning
    if (videoKeywords.length > 0) {
        relevanceScore = relevanceScore / Math.sqrt(videoKeywords.length);
    }

    // 4. Popularity (Logarithmic)
    const views = parseViews(video.views);
    const popularityScore = Math.log10(views + 1); // 0 to ~9

    // 5. Freshness (Exponential Decay)
    const daysAgo = parseUploadedAt(video.uploadedAt);
    // Boost extremely new videos (0-2 days) significantly
    let freshnessScore = 0;
    if (daysAgo <= 1) freshnessScore = 15;
    else if (daysAgo <= 3) freshnessScore = 10;
    else if (daysAgo <= 7) freshnessScore = 5;
    else freshnessScore = Math.max(0, 5 - Math.log2(daysAgo));

    // --- WEIGHTING ---
    
    let finalScore = 0;

    if (context.mode === 'discovery') {
        // Discovery Mode: Prioritize Freshness and Popularity, less on strict keyword match
        // Allows serendipity (finding things you didn't know you liked)
        finalScore = (
            (relevanceScore * 2.0) + 
            (popularityScore * 1.5) + 
            (freshnessScore * 3.0) // Huge boost for new content
        );
    } else {
        // Comfort Mode: Prioritize Relevance (Keyword Match)
        finalScore = (
            (relevanceScore * 4.0) + 
            (popularityScore * 0.5) + 
            (freshnessScore * 0.5)
        );
    }

    // 6. Deep Learning "Dropout" / Jitter
    // Adds slight randomness to prevent the feed from becoming stale/repetitive
    const jitter = (Math.random() - 0.5) * 0.15; // +/- 7.5%
    finalScore = finalScore * (1 + jitter) * historyPenalty;

    scoredVideos.push({ video, score: finalScore });
  }

  // Sort descending
  scoredVideos.sort((a, b) => b.score - a.score);

  // 7. Diversity Filter (Clustering check)
  // Don't show too many videos from the same channel
  const finalRankedList: Video[] = [];
  const channelCount = new Map<string, number>();
  const MAX_PER_CHANNEL = context.mode === 'discovery' ? 2 : 4; 

  for (const { video } of scoredVideos) {
    const count = channelCount.get(video.channelId) || 0;
    if (count < MAX_PER_CHANNEL) {
      finalRankedList.push(video);
      channelCount.set(video.channelId, count + 1);
    }
  }

  return finalRankedList;
};
