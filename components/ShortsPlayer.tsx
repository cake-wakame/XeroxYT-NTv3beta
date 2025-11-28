import React from 'react';
import type { Video } from '../types';
import * as ReactRouterDOM from 'react-router-dom';
import { LikeIcon, MoreIconHorizontal, CommentIcon } from './icons/Icons';

const { Link } = ReactRouterDOM;

interface ShortsPlayerProps {
    video: Video;
    playerParams: string;
}

const ShortsPlayer: React.FC<ShortsPlayerProps> = ({ video, playerParams }) => {
    const viewsText = video.views.includes('不明') ? '...' : video.views.split('回')[0];

    return (
        <div className="h-full w-full relative flex-shrink-0 bg-yt-black group">
            <iframe
                src={`https://www.youtubeeducation.com/embed/${video.id}${playerParams}`}
                title={video.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full pointer-events-auto"
            ></iframe>
            
            {/* Overlay Info - Appears on hover or standard behavior */}
            <div className="absolute bottom-0 left-0 right-0 p-4 text-white bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none">
                <div className="flex items-center pointer-events-auto">
                    <Link to={`/channel/${video.channelId}`} className="flex items-center flex-1">
                        <img src={video.channelAvatarUrl} alt={video.channelName} className="w-10 h-10 rounded-full border border-white/20" />
                        <span className="ml-3 font-semibold truncate drop-shadow-md">{video.channelName}</span>
                    </Link>
                    <button className="bg-white text-black font-semibold px-4 py-2 rounded-full text-sm flex-shrink-0 hover:bg-gray-200 transition-colors">
                        登録
                    </button>
                </div>
                <p className="mt-3 text-sm line-clamp-2 drop-shadow-md">{video.title}</p>
            </div>

            {/* Side Actions */}
            <div className="absolute bottom-20 right-2 flex flex-col items-center space-y-6 pointer-events-auto">
                <button className="flex flex-col items-center p-3 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-colors">
                    <LikeIcon />
                    <span className="text-xs mt-1 font-medium">{viewsText}</span>
                </button>
                <button className="flex flex-col items-center p-3 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-colors">
                    <CommentIcon />
                    <span className="text-xs mt-1 font-medium">...</span>
                </button>
                <button className="p-3 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-colors">
                    <MoreIconHorizontal />
                </button>
            </div>
        </div>
    );
};
export default ShortsPlayer;