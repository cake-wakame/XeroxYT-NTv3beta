import React, { useState, useEffect, useCallback, useRef } from 'react';
import ShortsPlayer from '../components/ShortsPlayer';
import { getPlayerConfig } from '../utils/api';
import { getXraiShorts } from '../utils/recommendation';
import type { Video } from '../types';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useSearchHistory } from '../contexts/SearchHistoryContext';
import { useHistory } from '../contexts/HistoryContext';
import { usePreference } from '../contexts/PreferenceContext';
import { ChevronRightIcon, ChevronLeftIcon } from '../components/icons/Icons';

// Rotation icons for up/down navigation
const ChevronUpIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" height="32" viewBox="0 0 24 24" width="32" className="fill-current text-white">
        <path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
    </svg>
);

const ChevronDownIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" height="32" viewBox="0 0 24 24" width="32" className="fill-current text-white">
        <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
    </svg>
);

const ShortsPage: React.FC = () => {
    const [videos, setVideos] = useState<Video[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [playerParams, setPlayerParams] = useState<string | null>(null);

    const { subscribedChannels } = useSubscription();
    const { searchHistory } = useSearchHistory();
    const { history: watchHistory } = useHistory();
    const { ngKeywords, ngChannels, hiddenVideos, negativeKeywords } = usePreference();
    
    // Prevent double fetch in strict mode
    const loadedRef = useRef(false);

    const loadShorts = useCallback(async () => {
        if (loadedRef.current) return;
        loadedRef.current = true;
        
        setIsLoading(true);
        setError(null);
        
        try {
            const paramsPromise = getPlayerConfig();
            
            // Use XRAI for Shorts
            const videosPromise = getXraiShorts({
                searchHistory,
                watchHistory,
                subscribedChannels,
                ngKeywords,
                ngChannels,
                hiddenVideos,
                negativeKeywords,
                page: 1
            });
            
            const [params, shorts] = await Promise.all([
                paramsPromise,
                videosPromise,
            ]);
            
            setPlayerParams(params);
            
            if (shorts.length === 0) {
                 setError("ショート動画が見つかりませんでした。");
            } else {
                setVideos(shorts);
            }

        } catch (err: any) {
            setError(err.message || 'ショート動画の読み込みに失敗しました。');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [searchHistory, watchHistory, subscribedChannels, ngKeywords, ngChannels, hiddenVideos, negativeKeywords]);

    useEffect(() => {
        loadShorts();
    }, [loadShorts]);

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    const handleNext = () => {
        if (currentIndex < videos.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            // Ideally load more here
            // For now, just loop or stop
        }
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowUp') handlePrev();
            if (e.key === 'ArrowDown') handleNext();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentIndex, videos.length]);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-64px)]">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-yt-blue"></div>
            </div>
        );
    }

    if (error) {
        return <div className="text-center text-red-500 bg-red-100 dark:bg-red-900/50 p-4 rounded-lg m-4">{error}</div>;
    }
    
    if (videos.length === 0 || !playerParams) return null;

    const currentVideo = videos[currentIndex];

    return (
        <div className="flex justify-center items-center h-[calc(100vh-64px)] w-full overflow-hidden relative">
            <div className="relative flex items-center justify-center gap-6">
                
                {/* Main Player Container */}
                <div className="relative h-[80vh] aspect-[9/16] rounded-2xl shadow-2xl overflow-hidden bg-black">
                     <ShortsPlayer video={currentVideo} playerParams={playerParams} />
                </div>

                {/* Navigation Controls (Right Side) */}
                <div className="flex flex-col gap-4">
                    <button 
                        onClick={handlePrev}
                        disabled={currentIndex === 0}
                        className={`p-3 rounded-full bg-yt-light-black/50 hover:bg-yt-light-black backdrop-blur-sm transition-all ${currentIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'opacity-100'}`}
                        aria-label="前の動画"
                    >
                        <ChevronUpIcon />
                    </button>
                    <button 
                        onClick={handleNext}
                        disabled={currentIndex === videos.length - 1}
                        className={`p-3 rounded-full bg-yt-light-black/50 hover:bg-yt-light-black backdrop-blur-sm transition-all ${currentIndex === videos.length - 1 ? 'opacity-30 cursor-not-allowed' : 'opacity-100'}`}
                        aria-label="次の動画"
                    >
                        <ChevronDownIcon />
                    </button>
                </div>
            </div>
        </div>
    );
};
export default ShortsPage;