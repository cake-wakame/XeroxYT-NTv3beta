
import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';

interface PreferenceContextType {
  ngKeywords: string[];
  ngChannels: string[];
  
  addNgKeyword: (keyword: string) => void;
  removeNgKeyword: (keyword: string) => void;
  
  addNgChannel: (channelId: string) => void;
  removeNgChannel: (channelId: string) => void;
  isNgChannel: (channelId: string) => boolean;

  exportUserData: () => void;
  importUserData: (file: File) => Promise<void>;
}

const PreferenceContext = createContext<PreferenceContextType | undefined>(undefined);

export const PreferenceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // NG Settings (Safety features kept)
  const [ngKeywords, setNgKeywords] = useState<string[]>(() => {
    try { return JSON.parse(window.localStorage.getItem('ngKeywords') || '[]'); } catch { return []; }
  });
  const [ngChannels, setNgChannels] = useState<string[]>(() => {
    try { return JSON.parse(window.localStorage.getItem('ngChannels') || '[]'); } catch { return []; }
  });

  // Persistence
  useEffect(() => { localStorage.setItem('ngKeywords', JSON.stringify(ngKeywords)); }, [ngKeywords]);
  useEffect(() => { localStorage.setItem('ngChannels', JSON.stringify(ngChannels)); }, [ngChannels]);

  // Handlers
  const addNgKeyword = (k: string) => !ngKeywords.includes(k) && setNgKeywords(p => [...p, k]);
  const removeNgKeyword = (k: string) => setNgKeywords(p => p.filter(x => x !== k));
  const addNgChannel = (id: string) => !ngChannels.includes(id) && setNgChannels(p => [...p, id]);
  const removeNgChannel = (id: string) => setNgChannels(p => p.filter(x => x !== id));
  const isNgChannel = (id: string) => ngChannels.includes(id);

  // Import/Export Logic
  const exportUserData = () => {
    const data = {
      timestamp: new Date().toISOString(),
      version: '2.0', // Updated version for simplified preference
      subscriptions: JSON.parse(localStorage.getItem('subscribedChannels') || '[]'),
      history: JSON.parse(localStorage.getItem('videoHistory') || '[]'),
      playlists: JSON.parse(localStorage.getItem('playlists') || '[]'),
      preferences: {
        ngKeywords: ngKeywords,
        ngChannels: ngChannels,
      }
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
          if (!json.subscriptions || !json.history) {
            throw new Error('Invalid backup file format');
          }
          
          // Restore Data
          localStorage.setItem('subscribedChannels', JSON.stringify(json.subscriptions));
          localStorage.setItem('videoHistory', JSON.stringify(json.history));
          localStorage.setItem('playlists', JSON.stringify(json.playlists || []));
          
          if (json.preferences) {
            const p = json.preferences;
            localStorage.setItem('ngKeywords', JSON.stringify(p.ngKeywords || []));
            localStorage.setItem('ngChannels', JSON.stringify(p.ngChannels || []));
          }

          // Refresh to load new data into contexts
          window.location.reload();
          resolve();
        } catch (err) {
          console.error(err);
          alert('ファイルの読み込みに失敗しました。正しいバックアップファイルを選択してください。');
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  };

  return (
    <PreferenceContext.Provider value={{
      ngKeywords, ngChannels,
      addNgKeyword, removeNgKeyword, addNgChannel, removeNgChannel, isNgChannel,
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
