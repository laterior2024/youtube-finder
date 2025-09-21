
import React from 'react';
import type { YouTubeVideo } from '../types';
import { ViewsIcon, LikesIcon, SubscribersIcon, TimeIcon } from './icons/StatIcons';
import { formatNumber, formatDuration, timeAgo } from '../utils/formatters';
import { getFlagEmoji, getCountryNameByCode } from '../utils/countryUtils';

interface VideoCardProps {
  video: YouTubeVideo;
  isSelected: boolean;
  onSelect: (videoId: string) => void;
}

const StatItem: React.FC<{ icon: React.ReactNode; value: string; label: string }> = ({ icon, value, label }) => (
    <div className="flex items-center space-x-1.5 text-gray-400" title={label}>
      {icon}
      <span className="text-sm font-medium">{value}</span>
    </div>
);

const VideoCard: React.FC<VideoCardProps> = ({ video, isSelected, onSelect }) => {
  
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg hover:shadow-red-500/30 transition-shadow duration-300 flex flex-col relative">
      <div className="absolute top-2 left-2 z-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(video.videoId)}
          onClick={(e) => e.stopPropagation()} // Prevent card click-through
          className="w-6 h-6 bg-gray-900/50 border-gray-500 rounded text-red-500 focus:ring-red-600 cursor-pointer"
        />
      </div>

      <div className="relative">
        <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer">
            <img 
                src={video.thumbnailUrl} 
                alt={video.title} 
                className="w-full h-auto aspect-video object-cover" 
            />
        </a>
        <span className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
          {formatDuration(video.durationSeconds)}
        </span>
      </div>
      <div className="p-4 flex flex-col flex-grow">
        <h3 className="text-md font-bold text-white mb-2 leading-snug line-clamp-2" title={video.title}>
            <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer" className="hover:text-red-400 transition-colors">
                {video.title}
            </a>
        </h3>
        
        <div className="mt-auto space-y-3 pt-3">
          <div className="flex items-center space-x-2">
             <a href={`https://www.youtube.com/channel/${video.channelId}`} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full bg-gray-700 flex-shrink-0">
               <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(video.channelName)}&background=374151&color=fff`} className="w-full h-full rounded-full object-cover" alt={`${video.channelName} avatar`} />
            </a>
            <div>
                 <a href={`https://www.youtube.com/channel/${video.channelId}`} target="_blank" rel="noopener noreferrer" className="hover:text-red-400 transition-colors" title={video.channelName}>
                    <p className="text-sm font-semibold text-gray-300 truncate">
                       <span className="mr-1.5" title={getCountryNameByCode(video.channelCountry)}>{getFlagEmoji(video.channelCountry)}</span>
                       {video.channelName}
                    </p>
                </a>
                <StatItem icon={<SubscribersIcon />} value={formatNumber(video.channelSubscriberCount)} label="구독자 수" />
            </div>
          </div>
          
          <div className="flex justify-between items-center text-xs text-gray-400">
            <StatItem icon={<ViewsIcon />} value={formatNumber(video.viewCount)} label="조회수" />
            <StatItem icon={<LikesIcon />} value={formatNumber(video.likeCount)} label="좋아요 수" />
            <StatItem icon={<TimeIcon />} value={timeAgo(video.uploadDate)} label={`업로드: ${new Date(video.uploadDate).toLocaleDateString()}`}/>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoCard;
