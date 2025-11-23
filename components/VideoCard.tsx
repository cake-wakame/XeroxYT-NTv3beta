
import React, { useState, useRef, useEffect, memo } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
import type { Video } from '../types';
import { ChevronRightIcon } from './icons/Icons';

const { Link } = ReactRouterDOM;

interface VideoCardProps {
  video: Video;
  hideChannelInfo?: boolean;
}

const VideoCard: React.FC<VideoCardProps> = memo(({ video, hideChannelInfo = false }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleChannelLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const toggleMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsMenuOpen(!isMenuOpen);
  };

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (
              menuRef.current && !menuRef.current.contains(event.target as Node) &&
              triggerRef.current && !triggerRef.current.contains(event.target as Node)
          ) {
              setIsMenuOpen(false);
          }
      };
      if(isMenuOpen) {
          document.addEventListener('mousedown', handleClickOutside);
      }
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const hasCollaborators = video.collaborators && video.collaborators.length > 1;
  
  return (
    <Link to={`/watch/${video.id}`} className="flex flex-col group cursor-pointer">
      <div className="relative rounded-xl overflow-hidden aspect-video bg-yt-light dark:bg-yt-dark-gray">
        <img 
            src={video.thumbnailUrl} 
            alt={video.title} 
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover" 
        />
        {video.duration && (
            <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-xs font-medium px-1.5 py-0.5 rounded-[4px]">
            {video.duration}
            </span>
        )}
      </div>
      <div className="flex mt-3 items-start">
        {!hideChannelInfo && video.channelId && (
          <div className="flex-shrink-0 mr-3 relative">
            <Link to={`/channel/${video.channelId}`} onClick={handleChannelLinkClick}>
              <img src={video.channelAvatarUrl} alt={video.channelName} loading="lazy" className="w-9 h-9 rounded-full object-cover" />
            </Link>
          </div>
        )}
        <div className="flex-1 min-w-0 relative">
          <h3 className="text-black dark:text-white text-base font-semibold leading-snug line-clamp-2 mb-1">
            {video.title}
          </h3>
          <div className="text-yt-light-gray text-sm">
            {!hideChannelInfo && video.channelId && (
                <div className="relative">
                    {hasCollaborators ? (
                        <>
                            <div 
                                ref={triggerRef}
                                className="flex items-center hover:text-black dark:hover:text-white cursor-pointer w-fit"
                                onClick={toggleMenu}
                            >
                                <span className="truncate max-w-[150px]">{video.channelName} 他</span>
                                <div className={`transform transition-transform duration-200 scale-75 ${isMenuOpen ? 'rotate-90' : ''}`}>
                                    <ChevronRightIcon />
                                </div>
                            </div>
                            {isMenuOpen && (
                                <div ref={menuRef} className="absolute top-full left-0 mt-1 w-48 bg-yt-white dark:bg-yt-light-black rounded-lg shadow-xl border border-yt-spec-light-20 dark:border-yt-spec-20 z-50 overflow-hidden">
                                    <div className="px-3 py-2 text-xs font-bold text-yt-light-gray border-b border-yt-spec-light-20 dark:border-yt-spec-20">
                                        チャンネルを選択
                                    </div>
                                    <div className="max-h-40 overflow-y-auto">
                                        {video.collaborators?.map(collab => (
                                            <Link 
                                                key={collab.id} 
                                                to={`/channel/${collab.id}`}
                                                className="flex items-center px-3 py-2 hover:bg-yt-spec-light-10 dark:hover:bg-yt-spec-10"
                                                onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); }}
                                            >
                                                <img src={collab.avatarUrl} alt={collab.name} loading="lazy" className="w-6 h-6 rounded-full mr-2" />
                                                <span className="text-xs font-semibold text-black dark:text-white truncate">{collab.name}</span>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <Link to={`/channel/${video.channelId}`} onClick={handleChannelLinkClick} className="hover:text-black dark:hover:text-white block truncate">
                            {video.channelName}
                        </Link>
                    )}
                </div>
            )}
            <p className="truncate">
              {[video.views?.includes('不明') ? null : video.views, video.uploadedAt].filter(Boolean).join(' • ')}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
});

export default VideoCard;
