
import React from 'react';

const VideoPlayerPageSkeleton: React.FC = () => {
    const RelatedVideoSkeleton = () => (
        <div className="flex gap-2">
            <div className="w-40 h-24 bg-yt-light dark:bg-yt-dark-gray rounded-lg flex-shrink-0"></div>
            <div className="flex-1 space-y-2">
                <div className="h-4 bg-yt-light dark:bg-yt-dark-gray rounded w-full"></div>
                <div className="h-4 bg-yt-light dark:bg-yt-dark-gray rounded w-3/4"></div>
                <div className="h-3 bg-yt-light dark:bg-yt-dark-gray rounded w-1/2"></div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col lg:flex-row gap-0 md:gap-6 max-w-[1400px] mx-auto pt-0 md:pt-6 px-0 md:px-6 animate-pulse">
            <div className="flex-grow lg:w-2/3">
                {/* Video Player Placeholder */}
                <div className="aspect-video bg-yt-light dark:bg-yt-dark-gray rounded-none md:rounded-xl"></div>
                
                <div className="px-4 md:px-0">
                    <div className="h-7 bg-yt-light dark:bg-yt-dark-gray rounded w-3/4 mt-4"></div>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-4">
                        <div className="flex items-center">
                            <div className="w-10 h-10 rounded-full bg-yt-light dark:bg-yt-dark-gray"></div>
                            <div className="ml-3 space-y-2">
                                <div className="h-4 bg-yt-light dark:bg-yt-dark-gray rounded w-32"></div>
                                <div className="h-3 bg-yt-light dark:bg-yt-dark-gray rounded w-24"></div>
                            </div>
                            <div className="ml-6 h-9 w-24 bg-yt-light dark:bg-yt-dark-gray rounded-full hidden sm:block"></div>
                        </div>
                        <div className="flex items-center space-x-2 mt-4 sm:mt-0">
                            <div className="h-9 w-32 bg-yt-light dark:bg-yt-dark-gray rounded-full"></div>
                            <div className="h-9 w-24 bg-yt-light dark:bg-yt-dark-gray rounded-full"></div>
                            <div className="h-9 w-24 bg-yt-light dark:bg-yt-dark-gray rounded-full"></div>
                        </div>
                    </div>

                    <div className="mt-4 bg-yt-light dark:bg-yt-dark-gray p-3 rounded-xl space-y-2">
                        <div className="h-4 bg-yt-gray dark:bg-yt-gray rounded w-48"></div>
                        <div className="h-3 bg-yt-gray dark:bg-yt-gray rounded w-full"></div>
                        <div className="h-3 bg-yt-gray dark:bg-yt-gray rounded w-full"></div>
                        <div className="h-3 bg-yt-gray dark:bg-yt-gray rounded w-2/3"></div>
                    </div>
                </div>
            </div>
            
            <div className="lg:w-[350px] xl:w-[380px] flex-shrink-0 px-4 md:px-0 mt-6 lg:mt-0">
                <div className="flex flex-col space-y-3">
                    {Array.from({ length: 10 }).map((_, index) => <RelatedVideoSkeleton key={index} />)}
                </div>
            </div>
        </div>
    );
};

export default VideoPlayerPageSkeleton;
