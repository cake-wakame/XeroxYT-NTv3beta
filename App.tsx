
import React, { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import BottomNavigation from './components/BottomNavigation';
import HomePage from './pages/HomePage';
import SearchResultsPage from './pages/SearchResultsPage';
import ChannelPage from './pages/ChannelPage';
import YouPage from './pages/YouPage';
import PlaylistPage from './pages/PlaylistPage';
import ShortsPage from './pages/ShortsPage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import HistoryPage from './pages/HistoryPage';
import VideoPlayerPage from './pages/VideoPlayerPage';
import { useTheme } from './hooks/useTheme';

const App: React.FC = () => {
  const [theme, toggleTheme] = useTheme();
  const location = useLocation();
  const isPlayerPage = location.pathname.startsWith('/watch');
  const isShortsPage = location.pathname === '/shorts';

  // 初期状態：プレイヤーページなら閉じる、それ以外は開く
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(!isPlayerPage);

  // ページ遷移時にプレイヤーページならサイドバーを閉じる
  useEffect(() => {
    if (isPlayerPage) {
        setIsSidebarOpen(false);
    } else if (!isShortsPage) {
        setIsSidebarOpen(true);
    }
  }, [location.pathname, isPlayerPage, isShortsPage]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  const getMargin = () => {
    if (isShortsPage) return ''; 
    
    // Mobile (handled via CSS classes mostly, base margin is 0)
    // Desktop margin logic:
    if (isSidebarOpen) return 'md:ml-60'; 
    
    // If player page and sidebar closed, no margin (full width/theater mode like)
    if (isPlayerPage && !isSidebarOpen) return ''; 

    // Mini sidebar margin for other pages when closed
    return 'md:ml-[72px]';
  };

  const mainContentMargin = getMargin();
  const mainContentPadding = isShortsPage ? '' : 'p-0 md:p-6 pb-16 md:pb-6'; // Add bottom padding for mobile nav
  
  const shouldShowSidebar = () => {
    if (isShortsPage) return false;
    if (isPlayerPage && !isSidebarOpen) return false; 
    return true;
  };

  return (
    <div className="min-h-screen bg-yt-white dark:bg-yt-black overflow-x-hidden">
      <Header 
        toggleSidebar={toggleSidebar} 
        theme={theme}
        toggleTheme={toggleTheme}
      />
      <div className="flex">
        {shouldShowSidebar() && <Sidebar isOpen={isSidebarOpen} />}
        <main className={`flex-1 mt-14 ${mainContentMargin} ${mainContentPadding} transition-all duration-300 ease-in-out ml-0 overflow-x-hidden`}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/watch/:videoId" element={<VideoPlayerPage />} />
            <Route path="/results" element={<SearchResultsPage />} />
            <Route path="/channel/:channelId" element={<ChannelPage />} />
            <Route path="/you" element={<YouPage />} />
            <Route path="/playlist/:playlistId" element={<PlaylistPage />} />
            <Route path="/shorts" element={<ShortsPage />} />
            <Route path="/subscriptions" element={<SubscriptionsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </main>
      </div>
      <BottomNavigation />
    </div>
  );
};

export default App;