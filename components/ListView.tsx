
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { YouTubeVideo } from '../types';
import { formatNumber, formatDuration, formatDateTime, formatTimeElapsed } from '../utils/formatters';
import { getFlagEmoji, getCountryNameByCode } from '../utils/countryUtils';
import { DownloadIcon, SortIcon, SortAscIcon, SortDescIcon } from './icons/ActionIcons';

type SortableKeys = keyof Pick<YouTubeVideo, 'channelName' | 'title' | 'uploadDate' | 'viewCount' | 'likeCount' | 'durationSeconds' | 'channelSubscriberCount'>;

interface ListViewProps {
  videos: YouTubeVideo[];
  requestSort: (key: SortableKeys) => void;
  sortConfig: { key: SortableKeys; direction: 'asc' | 'desc' } | null;
  selectedVideoIds: Set<string>;
  onSelectVideo: (videoId: string) => void;
  onSelectAll: () => void;
  totalVideos: number;
  channelTags: Map<string, string[]>;
  currentPage: number;
  itemsPerPage: number;
}

const getRowClass = (video: YouTubeVideo, selectedVideoIds: Set<string>): string => {
    const now = new Date();
    const uploadDate = new Date(video.uploadDate);
    const daysAgo = (now.getTime() - uploadDate.getTime()) / (1000 * 3600 * 24);

    const baseClass = 'border-b border-gray-700 transition-colors duration-200';
    let colorClass = '';

    // Priority: Green > Yellow > Selected > Default
    if (daysAgo <= 30 && video.viewCount > 1000000) {
        colorClass = selectedVideoIds.has(video.videoId) ? 'bg-emerald-500/60' : 'bg-emerald-500/40 hover:bg-emerald-500/50';
    } else if (daysAgo <= 7 && video.viewCount > 100000) {
        colorClass = selectedVideoIds.has(video.videoId) ? 'bg-yellow-400/60' : 'bg-yellow-400/40 hover:bg-yellow-400/50';
    } else {
        colorClass = selectedVideoIds.has(video.videoId) ? 'bg-red-900/30' : 'bg-transparent hover:bg-gray-700/50';
    }
    
    return `${baseClass} ${colorClass}`;
};


const SortableHeader: React.FC<{
  label: string;
  sortKey: SortableKeys;
  requestSort: (key: SortableKeys) => void;
  sortConfig: { key: SortableKeys; direction: 'asc' | 'desc' } | null;
  className?: string;
  isResizable?: boolean;
  onResizeStart?: (e: React.MouseEvent) => void;
}> = ({ label, sortKey, requestSort, sortConfig, className, isResizable, onResizeStart }) => {
  const isSorted = sortConfig?.key === sortKey;
  const direction = sortConfig?.direction;

  const getSortIcon = () => {
    if (!isSorted) return <SortIcon />;
    if (direction === 'asc') return <SortAscIcon />;
    return <SortDescIcon />;
  };

  return (
    <th scope="col" className={`px-4 py-3 relative ${className || ''}`}>
       <button onClick={() => requestSort(sortKey)} className="flex items-center gap-1.5 group w-full">
        {label}
        <span className="opacity-30 group-hover:opacity-100 transition-opacity">
            {getSortIcon()}
        </span>
      </button>
      {isResizable && (
        <div
          onMouseDown={onResizeStart}
          className="absolute top-0 right-0 h-full w-2 cursor-col-resize z-10"
        />
      )}
    </th>
  );
};

const ListView: React.FC<ListViewProps> = ({ videos, requestSort, sortConfig, selectedVideoIds, onSelectVideo, onSelectAll, totalVideos, channelTags, currentPage, itemsPerPage }) => {
    const headerCheckboxRef = useRef<HTMLInputElement>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [titleWidth, setTitleWidth] = useState(400);

    const resizingRef = useRef<{ isResizing: boolean; startX: number; startWidth: number }>({
        isResizing: false,
        startX: 0,
        startWidth: 0,
    });
    
    useEffect(() => {
        const checkIsMobile = () => {
            const mobile = window.innerWidth < 768; // Tailwind md breakpoint
            setIsMobile(mobile);
            setTitleWidth(mobile ? 250 : 400);
        };
        checkIsMobile();
        window.addEventListener('resize', checkIsMobile);
        return () => window.removeEventListener('resize', checkIsMobile);
    }, []);

    useEffect(() => {
        if (headerCheckboxRef.current) {
            const numSelected = selectedVideoIds.size;
            const numTotal = totalVideos;
            headerCheckboxRef.current.checked = numSelected === numTotal && numTotal > 0;
            headerCheckboxRef.current.indeterminate = numSelected > 0 && numSelected < numTotal;
        }
    }, [selectedVideoIds, totalVideos]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!resizingRef.current.isResizing) return;
        const newWidth = resizingRef.current.startWidth + e.clientX - resizingRef.current.startX;
        if (newWidth > 150) { // 최소 너비
            setTitleWidth(newWidth);
        }
    }, []);

    const handleMouseUp = useCallback(() => {
        resizingRef.current.isResizing = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, [handleMouseMove]);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        resizingRef.current = {
            isResizing: true,
            startX: e.clientX,
            startWidth: titleWidth,
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [titleWidth, handleMouseMove, handleMouseUp]);
    
    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);


  return (
    <div className="bg-gray-800/50 rounded-lg shadow-lg overflow-hidden border border-gray-700">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-300 table-fixed">
          <colgroup>
              <col style={{ width: '50px' }} />
              <col style={{ width: '60px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '200px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: `${titleWidth}px` }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '250px' }} />
          </colgroup>
          <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
            <tr>
              <th scope="col" className="px-2 py-3 text-center">#</th>
              <th scope="col" className="p-4">
                  <input
                    type="checkbox"
                    ref={headerCheckboxRef}
                    onChange={onSelectAll}
                    className="w-4 h-4 bg-gray-700 border-gray-500 rounded text-red-500 focus:ring-red-600"
                   />
              </th>
              <th scope="col" className="px-4 py-3">국가</th>
              <SortableHeader label="채널명" sortKey="channelName" requestSort={requestSort} sortConfig={sortConfig} />
              <th scope="col" className="px-4 py-3">썸네일</th>
              <SortableHeader label="영상 제목" sortKey="title" requestSort={requestSort} sortConfig={sortConfig} isResizable={!isMobile} onResizeStart={handleResizeStart} />
              <SortableHeader label="구독자 수" sortKey="channelSubscriberCount" requestSort={requestSort} sortConfig={sortConfig} className="text-right" />
              <SortableHeader label="조회수" sortKey="viewCount" requestSort={requestSort} sortConfig={sortConfig} className="text-right" />
              <SortableHeader label="업로드" sortKey="uploadDate" requestSort={requestSort} sortConfig={sortConfig} className="text-right" />
              <th scope="col" className="px-4 py-3 text-right">경과 시간</th>
              <SortableHeader label="좋아요" sortKey="likeCount" requestSort={requestSort} sortConfig={sortConfig} className="text-right" />
              <SortableHeader label="영상 길이" sortKey="durationSeconds" requestSort={requestSort} sortConfig={sortConfig} className="text-right" />
              <th scope="col" className="px-4 py-3">태그</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((video, index) => {
              const rowNumber = (currentPage - 1) * itemsPerPage + index + 1;
              const tags = channelTags.get(video.channelId) || [];
              return (
              <tr key={video.videoId} className={getRowClass(video, selectedVideoIds)}>
                <td className="px-2 py-4 text-center text-gray-500 text-xs font-mono">
                  {rowNumber}
                </td>
                <td className="w-4 p-4">
                    <input
                        type="checkbox"
                        checked={selectedVideoIds.has(video.videoId)}
                        onChange={() => onSelectVideo(video.videoId)}
                        className="w-4 h-4 bg-gray-700 border-gray-500 rounded text-red-500 focus:ring-red-600"
                    />
                </td>
                <td className="px-4 py-4 font-medium text-gray-200 whitespace-nowrap" title={getCountryNameByCode(video.channelCountry)}>
                   <span className="text-xl mr-2">{getFlagEmoji(video.channelCountry)}</span>
                   {video.channelCountry}
                </td>
                <td className="px-4 py-4 font-medium text-gray-200 whitespace-nowrap overflow-hidden text-ellipsis">
                    <a href={`https://www.youtube.com/channel/${video.channelId}`} target="_blank" rel="noopener noreferrer" className="hover:text-red-400 transition-colors">
                        {video.channelName}
                    </a>
                </td>
                <td className="px-4 py-2">
                    <div className="relative group w-24 h-[54px]">
                        <img 
                            src={video.thumbnailUrl} 
                            alt={video.title} 
                            className="w-full h-full object-cover rounded-md" 
                        />
                        <a 
                            href={video.thumbnailUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            title="썸네일 다운로드 (새 탭에서 열기)" 
                            className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-md cursor-pointer"
                        >
                            <DownloadIcon />
                        </a>
                    </div>
                </td>
                <td className="px-4 py-4">
                   <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer" className="hover:text-red-400 transition-colors line-clamp-2 break-all" title={video.title}>
                       {video.title}
                   </a>
                </td>
                <td className="px-4 py-4 text-right whitespace-nowrap">{formatNumber(video.channelSubscriberCount)}</td>
                <td className="px-4 py-4 text-right whitespace-nowrap">{formatNumber(video.viewCount)}</td>
                <td className="px-4 py-4 text-right whitespace-nowrap">{formatDateTime(video.uploadDate)}</td>
                <td className="px-4 py-4 text-right whitespace-nowrap">{formatTimeElapsed(video.uploadDate)}</td>
                <td className="px-4 py-4 text-right whitespace-nowrap">{formatNumber(video.likeCount)}</td>
                <td className="px-4 py-4 text-right whitespace-nowrap">{formatDuration(video.durationSeconds)}</td>
                <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto custom-scrollbar">
                        {tags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 text-xs bg-gray-600 text-gray-200 rounded-full" title={tag}>
                                {tag}
                            </span>
                        ))}
                    </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
        <style>{`
            .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
            background-color: #4A5568; /* gray-700 */
            border-radius: 20px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background-color: #718096; /* gray-600 */
            }
            /* For Firefox */
            .custom-scrollbar {
            scrollbar-width: thin;
            scrollbar-color: #4A5568 transparent;
            }
        `}</style>
      </div>
    </div>
  );
};

export default ListView;
