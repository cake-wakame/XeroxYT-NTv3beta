import React from 'react';
// FIX: Use named import for Link from react-router-dom
import { Link } from 'react-router-dom';
import type { Video } from '../types';

interface ShortsCardProps {
  video: Video;
  context?: {
    type: 'channel' | 'home' | 'search';
    channelId?: string;
  };
}

const ShortsCard: React.FC<ShortsCardProps> = ({ video, context }) => {
  return (
    <Link 
      to={`/shorts/${video.id}`} 
      state={{ context }}
      className="group" // Removed w-44 and flex-shrink-0 to allow flexible sizing
    >
      {/* Changed background to black for proper letterboxing with object-contain */}
      <div className="relative rounded-xl overflow-hidden aspect-[9/16] bg-black shadow-md group-hover:shadow-xl transition-all duration-300">
        <img 
          src={video.thumbnailUrl} 
          alt={video.title} 
          loading="lazy"
          // Changed to object-contain to prevent image cropping
          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300" 
        />
      </div>
      <div className="mt-2 pr-2">
        <h3 className="text-black dark:text-white text-base font-bold leading-snug break-words max-h-12 overflow-hidden line-clamp-2">
          {video.title}
        </h3>
        <p className="text-yt-light-gray text-sm mt-1 font-medium">{video.views}</p>
      </div>
    </Link>
  );
};

export default ShortsCard;