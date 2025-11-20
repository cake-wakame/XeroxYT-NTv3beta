
import type { Video, Channel } from '../types';
import { searchVideos, getChannelVideos } from './api';

// 文字列からハッシュタグや重要そうなキーワードを抽出する（精度向上）
const extractKeywords = (text: string): string[] => {
    if (!text) return [];
    // ハッシュタグを抽出
    const hashtags = text.match(/#[^\s#]+/g) || [];
    
    // 日本語や英語の名詞っぽいものを簡易的に抽出
    // 括弧内のテキストなどを重視 (e.g., [MV], 【歌ってみた】)
    const brackets = text.match(/[\[【](.+?)[\]】]/g) || [];
    
    // 通常の単語（簡易的な分割）- ノイズ除去を強化
    const rawText = text.replace(/[\[【].+?[\]】]/g, '').replace(/#[^\s#]+/g, '');
    // 記号を除去し、スペースで分割
    const words = rawText.replace(/[!-/:-@[-`{-~]/g, ' ').split(/\s+/);
    
    // クリーンアップ
    const cleanHashtags = hashtags.map(t => t.trim());
    const cleanBrackets = brackets.map(t => t.replace(/[\[【\]】]/g, '').trim());
    const cleanWords = words.filter(w => w.length > 1 && !/^(http|www|com|jp)/.test(w)); // URLや短すぎる単語を除外
    
    return [...cleanHashtags, ...cleanBrackets, ...cleanWords];
};

// 配列をシャッフルする
const shuffleArray = <T,>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};

interface RecommendationSource {
    searchHistory: string[];
    watchHistory: Video[];
    subscribedChannels: Channel[];
    preferredGenres: string[];
    preferredChannels: string[];
    page: number;
}

export const getDeeplyAnalyzedRecommendations = async (sources: RecommendationSource): Promise<Video[]> => {
    const { searchHistory, watchHistory, subscribedChannels, preferredGenres, preferredChannels, page } = sources;
    
    const queries: Set<string> = new Set();
    const TARGET_COUNT = 100; // 目標取得件数

    // 1. ユーザーの明示的な好み (PreferenceContext) - 最優先
    if (preferredGenres.length > 0) {
        // ページごとに異なるジャンルをピックアップしつつ、ランダム性も持たせる
        const baseIndex = (page - 1) % preferredGenres.length;
        queries.add(preferredGenres[baseIndex]);
        // ランダムに2つ追加
        for(let i=0; i<2; i++) {
             queries.add(preferredGenres[Math.floor(Math.random() * preferredGenres.length)]);
        }
    }

    if (preferredChannels.length > 0) {
        const channelName = preferredChannels[(page - 1) % preferredChannels.length];
        queries.add(`${channelName} `); 
        queries.add(`${channelName} new`);
    }

    // 2. 視聴履歴からの深い分析 (WatchHistory) - 精度向上
    if (watchHistory.length > 0) {
        // 直近の履歴だけでなく、少し前の履歴からもサンプリングして多様性を出す
        const historySamples = [
            watchHistory[0], // 最新
            watchHistory[Math.floor(Math.random() * Math.min(watchHistory.length, 5))], // 直近5件からランダム
            watchHistory[Math.min(watchHistory.length - 1, 10 + Math.floor(Math.random() * 10))] // 少し前の履歴
        ].filter(Boolean);

        historySamples.forEach(video => {
             const keywords = extractKeywords(video.title + ' ' + (video.descriptionSnippet || ''));
             if (keywords.length > 0) {
                 // 具体的なキーワードの組み合わせ
                 queries.add(keywords.slice(0, 2).join(' '));
                 // 別の組み合わせ（多様性）
                 if (keywords.length > 2) {
                     queries.add(keywords[Math.floor(Math.random() * keywords.length)]);
                 }
             } else {
                 // キーワード抽出できない場合はタイトルの一部を使用
                 queries.add(video.title.substring(0, 20));
             }
        });
    }

    // 3. 検索履歴 (SearchHistory)
    if (searchHistory.length > 0) {
        // 直近の検索ワード
        queries.add(searchHistory[0]);
        // 過去の検索ワードからランダム
        if (searchHistory.length > 1) {
             queries.add(searchHistory[Math.floor(Math.random() * Math.min(searchHistory.length, 10))]);
        }
    }

    // 4. 登録チャンネル (Subscriptions)
    const subPromises: Promise<any>[] = [];
    // 登録チャンネル数が少ない場合は全部、多い場合はランダムに3-5個ピックアップ
    const targetSubCount = Math.min(subscribedChannels.length, 5);
    const shuffledSubs = shuffleArray(subscribedChannels);
    
    for (let i = 0; i < targetSubCount; i++) {
        const subChannel = shuffledSubs[i];
        // チャンネルの最新動画を取得 (ページ送りも活用して少し古いのや人気のも混ぜたいが、API制限のため最新のみ)
        subPromises.push(
            getChannelVideos(subChannel.id).then(res => 
                // 各チャンネルから多めに取得
                res.videos.slice(0, 10).map(v => ({
                    ...v,
                    channelName: subChannel.name,
                    channelAvatarUrl: subChannel.avatarUrl,
                    channelId: subChannel.id
                }))
            ).catch(() => [])
        );
    }

    // クエリ実行 (並列処理で高速化)
    // クエリリストを配列化し、重複を除去した上で実行
    const uniqueQueries = Array.from(queries).filter(Boolean);
    
    // クエリごとの取得件数を増やして合計100件を目指す
    // Search APIは1ページあたり50件返すが、関連性の高い上位のみを使うために20-30件程度採用する
    const searchPromises = uniqueQueries.map(q => 
        searchVideos(q).then(res => res.videos.slice(0, 20)).catch(() => [])
    );

    // 全てのAPIリクエストを並列実行
    const results = await Promise.allSettled([...searchPromises, ...subPromises]);
    
    let combinedVideos: Video[] = [];
    results.forEach(result => {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
            combinedVideos.push(...result.value);
        }
    });

    // 重複排除
    const seenIds = new Set<string>();
    let uniqueVideos: Video[] = [];
    
    for (const video of combinedVideos) {
        if (!seenIds.has(video.id)) {
            seenIds.add(video.id);
            uniqueVideos.push(video);
        }
    }

    // ショート動画の除外（ホーム画面のおすすめにはショートをあまり混ぜない方針の場合）
    // ここでは完全に除外せず、比率を下げるなどの調整が可能だが、現状は簡易フィルタ
    if (uniqueVideos.length > 20) {
         // 1分未満の動画を少し間引く（完全に消すとショートが見れないので）
         uniqueVideos = uniqueVideos.filter(v => {
             const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
             const matches = v.isoDuration.match(regex);
             if (!matches) return true;
             const h = parseInt(matches[1] || '0', 10);
             const m = parseInt(matches[2] || '0', 10);
             const s = parseInt(matches[3] || '0', 10);
             const seconds = h * 3600 + m * 60 + s;
             return seconds > 60 || Math.random() > 0.7; // 30%の確率でショートも残す
         });
    }

    // シャッフルして返す
    return shuffleArray(uniqueVideos).slice(0, TARGET_COUNT);
};
