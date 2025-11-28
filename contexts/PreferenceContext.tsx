import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { extractKeywords } from '../utils/xrai';
import type { Video } from '../types';

export interface BlockedChannel {
    id: string;
    name: string;
    avatarUrl: string;
}

export interface HiddenVideo {
    id: string;
    title: string;
    channelName: string;
}

interface PreferenceContextType {
  ngKeywords: string[];
  ngChannels: BlockedChannel[];
  hiddenVideos: HiddenVideo[];
  negativeKeywords: Map<string, number>;
  
  addNgKeyword: (keyword: string) => void;
  removeNgKeyword: (keyword: string) => void;
  
  addNgChannel: (channel: BlockedChannel) => void;
  removeNgChannel: (channelId: string) => void;
  isNgChannel: (channelId: string) => boolean;

  addHiddenVideo: (video: HiddenVideo) => void;
  unhideVideo: (videoId: string) => void;
  isvideoHidden: (videoId: string) => boolean;
  removeNegativeProfileForVideos: (videos: Video[]) => void;

  exportUserData: () => void;
  importUserData: (file: File) => Promise<void>;
}

const PreferenceContext = createContext<PreferenceContextType | undefined>(undefined);

export const PreferenceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [ngKeywords, setNgKeywords] = useState<string[]>(() => {
    try { return JSON.parse(window.localStorage.getItem('ngKeywords') || '[]'); } catch { return []; }
  });
  const [ngChannels, setNgChannels] = useState<BlockedChannel[]>(() => {
    try { 
        // Migration from old string[] format
        const data = JSON.parse(window.localStorage.getItem('ngChannels') || '[]');
        if (data.length > 0 && typeof data[0] === 'string') return []; // Invalidate old format
        return data;
    } catch { return []; }
  });
  
  const [hiddenVideos, setHiddenVideos] = useState<HiddenVideo[]>(() => {
    try { 
        // Migration from old string[] format
        const data = JSON.parse(window.localStorage.getItem('hiddenVideos') || '[]');
        if (data.length > 0 && typeof data[0] === 'string') return []; // Invalidate old format
        return data;
    } catch { return []; }
  });

  const [negativeKeywords, setNegativeKeywords] = useState<Map<string, number>>(() => {
     try {
         const raw = JSON.parse(window.localStorage.getItem('negativeKeywords') || '[]');
         return new Map<string, number>(raw);
     } catch { return new Map(); }
  });

  useEffect(() => { localStorage.setItem('ngKeywords', JSON.stringify(ngKeywords)); }, [ngKeywords]);
  useEffect(() => { localStorage.setItem('ngChannels', JSON.stringify(ngChannels)); }, [ngChannels]);
  useEffect(() => { localStorage.setItem('hiddenVideos', JSON.stringify(hiddenVideos)); }, [hiddenVideos]);
  useEffect(() => { 
      localStorage.setItem('negativeKeywords', JSON.stringify(Array.from(negativeKeywords.entries()))); 
  }, [negativeKeywords]);

  const addNgKeyword = (k: string) => !ngKeywords.includes(k) && setNgKeywords(p => [...p, k]);
  const removeNgKeyword = (k: string) => setNgKeywords(p => p.filter(x => x !== k));

  const addNgChannel = (channel: BlockedChannel) => !ngChannels.some(c => c.id === channel.id) && setNgChannels(p => [...p, channel]);
  const removeNgChannel = (id: string) => setNgChannels(p => p.filter(c => c.id !== id));
  const isNgChannel = (id: string) => ngChannels.some(c => c.id === id);

  const addHiddenVideo = (video: HiddenVideo) => {
      if (!hiddenVideos.some(v => v.id === video.id)) {
          setHiddenVideos(prev => [...prev, video]);
      }
      
      const keywords = [ ...extractKeywords(video.title), ...extractKeywords(video.channelName) ];
      setNegativeKeywords(prev => {
          const newMap = new Map<string, number>(prev);
          keywords.forEach(k => newMap.set(k, (newMap.get(k) || 0) + 1));
          return newMap;
      });
  };

  const unhideVideo = (videoId: string) => {
    const videoToUnhide = hiddenVideos.find(v => v.id === videoId);
    if (!videoToUnhide) return;

    // Remove from hidden list
    setHiddenVideos(prev => prev.filter(v => v.id !== videoId));

    // Decrement negative keywords
    const keywordsToDecrement = [
        ...extractKeywords(videoToUnhide.title),
        ...extractKeywords(videoToUnhide.channelName)
    ];

    setNegativeKeywords(prev => {
        const newMap = new Map<string, number>(prev);
        keywordsToDecrement.forEach(keyword => {
            if (newMap.has(keyword)) {
                const currentWeight = newMap.get(keyword)!;
                if (currentWeight <= 1) newMap.delete(keyword);
                else newMap.set(keyword, currentWeight - 1);
            }
        });
        return newMap;
    });
  };
  
  const removeNegativeProfileForVideos = (videos: Video[]) => {
    if (videos.length === 0) return;
    const idsToRemove = new Set(videos.map(v => v.id));
    setHiddenVideos(prev => prev.filter(v => !idsToRemove.has(v.id)));

    const keywordsToDecrement = videos.flatMap(v => [
        ...extractKeywords(v.title), ...extractKeywords(v.channelName)
    ]);
    setNegativeKeywords(prev => {
        const newMap = new Map<string, number>(prev);
        keywordsToDecrement.forEach(keyword => {
            if (newMap.has(keyword)) {
                const currentWeight = newMap.get(keyword)!;
                if (currentWeight <= 1) newMap.delete(keyword);
                else newMap.set(keyword, currentWeight - 1);
            }
        });
        return newMap;
    });
  };

  const isvideoHidden = (videoId: string) => hiddenVideos.some(v => v.id === videoId);

  const exportUserData = () => {
    const data = {
      timestamp: new Date().toISOString(),
      version: '3.0',
      subscriptions: JSON.parse(localStorage.getItem('subscribedChannels') || '[]'),
      history: JSON.parse(localStorage.getItem('videoHistory') || '[]'),
      playlists: JSON.parse(localStorage.getItem('playlists') || '[]'),
      preferences: { ngKeywords, ngChannels, hiddenVideos }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xeroxyt_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importUserData = async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          if (!json.subscriptions || !json.history) throw new Error('Invalid backup file');
          
          localStorage.setItem('subscribedChannels', JSON.stringify(json.subscriptions));
          localStorage.setItem('videoHistory', JSON.stringify(json.history));
          localStorage.setItem('playlists', JSON.stringify(json.playlists || []));
          
          if (json.preferences) {
            const p = json.preferences;
            localStorage.setItem('ngKeywords', JSON.stringify(p.ngKeywords || []));
            localStorage.setItem('ngChannels', JSON.stringify(p.ngChannels || []));
            // Legacy support: hiddenVideoIds might be string[]
            const hidden = Array.isArray(p.hiddenVideos) && p.hiddenVideos.every((item: any) => typeof item === 'object') 
                ? p.hiddenVideos 
                : [];
            localStorage.setItem('hiddenVideos', JSON.stringify(hidden));
          }

          window.location.reload();
          resolve();
        } catch (err) {
          alert('ファイルの読み込みに失敗しました。');
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  };

  return (
    <PreferenceContext.Provider value={{
      ngKeywords, ngChannels, hiddenVideos, negativeKeywords,
      addNgKeyword, removeNgKeyword, addNgChannel, removeNgChannel, isNgChannel,
      addHiddenVideo, unhideVideo, isvideoHidden, removeNegativeProfileForVideos,
      exportUserData, importUserData
    }}>
      {children}
    </PreferenceContext.Provider>
  );
};

export const usePreference = (): PreferenceContextType => {
  const context = useContext(PreferenceContext);
  if (context === undefined) {
    throw new Error('usePreference must be used within a PreferenceProvider');
  }
  return context;
};