
import type { Video, Channel } from '../types';

// --- Types ---

export interface UserProfile {
  keywords: Map<string, number>; // The "User Vector"
  magnitude: number; // For Cosine Similarity normalization
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
  'about', 'and', 'the', 'to', 'a', 'of', 'in', 'for', 'on', 'with', 'as', 'at', 'movie', 'video',
  'official', 'channel', 'music', 'mv', 'pv'
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

// --- Language Detection ---

// Simple heuristic: Checks for Hiragana, Katakana, or common CJK ranges.
const containsJapanese = (text: string): boolean => {
    // Hiragana: 3040-309F, Katakana: 30A0-30FF, CJK Unified Ideographs: 4E00-9FFF
    return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text);
};

// --- Vector Operations ---

const calculateMagnitude = (vector: Map<string, number>): number => {
    let sumSq = 0;
    for (const val of vector.values()) {
        sumSq += val * val;
    }
    return Math.sqrt(sumSq);
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

  // 1. Search History (High Intent - Explicit)
  sources.searchHistory.slice(0, 30).forEach((term, index) => {
    // Exponential decay: recent searches are much more important
    const weight = 10.0 * Math.exp(-index / 5); 
    addKeywords(term, weight);
  });

  // 2. Watch History (Implicit Interest - Deep Learning Training Data)
  sources.watchHistory.slice(0, 100).forEach((video, index) => {
    const weight = 5.0 * Math.exp(-index / 20);
    addKeywords(video.title, weight);
    addKeywords(video.channelName, weight * 1.5); 
  });

  // 3. Subscriptions (Long-term Affinity - Bias)
  sources.subscribedChannels.forEach(channel => {
    addKeywords(channel.name, 4.0);
  });
  
  const magnitude = calculateMagnitude(keywords);

  return { keywords, magnitude };
};

// --- Inference Helpers ---

// Infers the top "Concepts" (keywords) from the user vector
export const inferTopInterests = (profile: UserProfile, limit: number = 6): string[] => {
    return [...profile.keywords.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(e => e[0])
        .slice(0, limit);
};

// --- Parsing Helpers ---

const parseUploadedAtDays = (uploadedAt: string): number => {
    if (!uploadedAt) return 365; // Default to old
    const text = uploadedAt.toLowerCase();
    const numMatch = text.match(/(\d+)/);
    const num = numMatch ? parseInt(numMatch[1], 10) : 0;

    // Convert everything to "Days ago" approximation
    if (text.includes('分前') || text.includes('minute')) return 0.001;
    if (text.includes('時間前') || text.includes('hour')) return num / 24;
    if (text.includes('日') || text.includes('day')) return num;
    if (text.includes('週') || text.includes('week')) return num * 7;
    if (text.includes('月') || text.includes('month')) return num * 30;
    if (text.includes('年') || text.includes('year')) return num * 365;
    return 365; 
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
    
    // 1. Negative Filtering (Blocking)
    if (context.ngKeywords.some(ng => fullText.includes(ng.toLowerCase()))) continue;
    if (context.ngChannels.includes(video.channelId)) continue;
    
    // 2. Language Filtering (Strict Japanese Preference)
    const isJapanese = containsJapanese(fullText);
    let languagePenalty = 1.0;
    if (!isJapanese) {
        languagePenalty = 0.05; // Severe penalty for non-Japanese
    }

    // 3. Vector Inference (Cosine Similarity)
    let dotProduct = 0;
    let videoVectorMagSq = 0;
    
    const videoKeywords = extractKeywords(fullText);
    
    videoKeywords.forEach(kw => {
        // Term Frequency in this video (simplified to 1 for binary presence, could be improved)
        const weight = 1; 
        videoVectorMagSq += weight * weight;

        if (userProfile.keywords.has(kw)) {
            dotProduct += userProfile.keywords.get(kw)! * weight;
        }
    });

    let cosineSimilarity = 0;
    if (userProfile.magnitude > 0 && videoVectorMagSq > 0) {
        cosineSimilarity = dotProduct / (userProfile.magnitude * Math.sqrt(videoVectorMagSq));
    }

    // 4. Velocity / Trending Score (Deep Thinking for "New & Hot")
    // Velocity = Views / (Days + small_epsilon)
    const daysAgo = parseUploadedAtDays(video.uploadedAt);
    const views = parseViews(video.views);
    
    // Calculate "Views Per Day" velocity
    const velocity = views / (Math.max(daysAgo, 0.1)); 
    const velocityScore = Math.log10(velocity + 1); // Normalize to 0-8 range typically

    // 5. Freshness Boost
    let freshnessBoost = 1.0;
    if (daysAgo < 3) freshnessBoost = 1.5; // Boost videos < 3 days old
    if (daysAgo < 1) freshnessBoost = 2.0; // Huge boost for < 24h

    // --- WEIGHTING & SCORING ---
    
    let finalScore = 0;

    // Base score comes from Similarity (Relevance)
    // We scale it up (e.g., 0.5 -> 50 points)
    const relevanceBase = cosineSimilarity * 100;

    if (context.mode === 'discovery') {
        // Discovery Mode: High Relevance + High Velocity + Freshness
        // We want "Relevant Trending" videos.
        // If Relevance is low, Velocity shouldn't save it (prevents unrelated viral videos).
        
        if (relevanceBase > 5) { // Threshold: Must be somewhat relevant
            finalScore = relevanceBase * (1 + (velocityScore * 0.5)) * freshnessBoost;
        } else {
            finalScore = relevanceBase; // Low relevance = Low score
        }

    } else {
        // Comfort Mode: Pure Relevance + History Affinity
        let historyBoost = 1.0;
        if (video.channelId && context.watchHistory.some(w => w.channelId === video.channelId)) {
            historyBoost = 1.3; // Boost known channels
        }
        finalScore = relevanceBase * historyBoost;
    }
    
    // History Penalty (Already watched?)
    if (seenIds.has(video.id)) {
        finalScore *= 0.01; 
    }

    finalScore *= languagePenalty;

    // Jitter for variety
    finalScore *= (0.95 + Math.random() * 0.1);

    scoredVideos.push({ video, score: finalScore });
  }

  // Sort descending
  scoredVideos.sort((a, b) => b.score - a.score);

  // 6. Diversity Filter (Clustering)
  const finalRankedList: Video[] = [];
  const channelCount = new Map<string, number>();
  const MAX_PER_CHANNEL = context.mode === 'discovery' ? 1 : 3; // Strict diversity for discovery

  for (const { video } of scoredVideos) {
    const count = channelCount.get(video.channelId) || 0;
    if (count < MAX_PER_CHANNEL) {
      finalRankedList.push(video);
      channelCount.set(video.channelId, count + 1);
    }
  }

  return finalRankedList;
};
