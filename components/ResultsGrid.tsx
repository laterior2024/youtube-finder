
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { SearchFilters, YouTubeVideo } from '../types';
import { translateVideosToKorean } from '../services/geminiService';
import VideoCard from './VideoCard';
import LoadingSpinner from './LoadingSpinner';
import ListView from './ListView';
import { formatDuration } from '../utils/formatters';
import { FileTextIcon, ChevronLeftIcon, ChevronRightIcon, LanguageIcon, TagIcon } from './icons/ActionIcons';

type SortableKeys = keyof Pick<YouTubeVideo, 'channelName' | 'title' | 'uploadDate' | 'viewCount' | 'likeCount' | 'durationSeconds' | 'channelSubscriberCount'>;

interface ResultsGridProps {
  videos: YouTubeVideo[];
  isLoading: boolean;
  error: string | null;
  hasSearched: boolean;
  viewMode: 'grid' | 'list';
  setViewMode: React.Dispatch<React.SetStateAction<'grid' | 'list'>>;
  filters: SearchFilters;
}

const defaultSortConfig = { key: 'viewCount', direction: 'desc' } as const;

const ResultsGrid: React.FC<ResultsGridProps> = ({ videos, isLoading, error, hasSearched, viewMode, setViewMode, filters }) => {
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'asc' | 'desc' }>(defaultSortConfig);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(50);

  // Translation State
  const [isKoreanView, setIsKoreanView] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [processedVideos, setProcessedVideos] = useState<YouTubeVideo[]>(videos);
  
  useEffect(() => {
    setProcessedVideos(videos);
    setSortConfig(defaultSortConfig);
    setIsKoreanView(false); // Reset view on new search
    setCurrentPage(1);
    setSelectedVideoIds(new Set());
  }, [videos]);

  const sortedVideos = useMemo(() => {
    let sortableItems = [...processedVideos];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [processedVideos, sortConfig]);

  const displayVideos = useMemo(() => {
    if (isKoreanView) {
        return sortedVideos.map(v => ({
            ...v,
            title: v.koreanTitle || v.title,
            channelName: v.koreanChannelName || v.channelName,
        }));
    }
    return sortedVideos;
  }, [sortedVideos, isKoreanView]);

  const channelAllTags = useMemo(() => {
    const tagsByChannel = new Map<string, Set<string>>();
    for (const video of sortedVideos) {
        if (!tagsByChannel.has(video.channelId)) {
            tagsByChannel.set(video.channelId, new Set());
        }
        if (video.tags && video.tags.length > 0) {
            const currentTags = tagsByChannel.get(video.channelId)!;
            video.tags.forEach(tag => currentTags.add(tag.toLowerCase()));
        }
    }

    const allTagsByChannelArray = new Map<string, string[]>();
    for (const [channelId, tagsSet] of tagsByChannel.entries()) {
        allTagsByChannelArray.set(channelId, Array.from(tagsSet));
    }
    return allTagsByChannelArray;
  }, [sortedVideos]);
  
  // Reset pagination when items per page change
  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage]);

  const totalPages = Math.ceil(displayVideos.length / itemsPerPage);
  const paginatedVideos = useMemo(() => {
      return displayVideos.slice(
          (currentPage - 1) * itemsPerPage,
          currentPage * itemsPerPage
      );
  }, [displayVideos, currentPage, itemsPerPage]);

  useEffect(() => {
    // Update "Select All" checkbox indeterminate state
    if (selectAllCheckboxRef.current) {
        const numSelected = selectedVideoIds.size;
        const numVideos = sortedVideos.length; // Base on all videos, not just paginated
        selectAllCheckboxRef.current.checked = numSelected === numVideos && numVideos > 0;
        selectAllCheckboxRef.current.indeterminate = numSelected > 0 && numSelected < numVideos;
    }
  }, [selectedVideoIds, sortedVideos]);

  const requestSort = (key: SortableKeys) => {
    if (sortConfig.key === key) {
        if (sortConfig.direction === 'asc') {
            setSortConfig({ key, direction: 'desc' });
        } else {
            setSortConfig(defaultSortConfig);
        }
    } else {
        setSortConfig({ key, direction: 'asc' });
    }
  };
  
  const handleSelectVideo = (videoId: string) => {
    setSelectedVideoIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(videoId)) {
        newSet.delete(videoId);
      } else {
        newSet.add(videoId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedVideoIds.size === sortedVideos.length) {
      setSelectedVideoIds(new Set());
    } else {
      setSelectedVideoIds(new Set(sortedVideos.map(v => v.videoId)));
    }
  };

  const handleTranslateToggle = async () => {
    const needsTranslation = processedVideos.length > 0 && !processedVideos[0].koreanTitle;

    if (needsTranslation) {
        setIsTranslating(true);
        try {
            const translated = await translateVideosToKorean(processedVideos);
            setProcessedVideos(translated);
            setIsKoreanView(true);
        } catch (err) {
            console.error("Translation failed:", err);
            // Optionally: show an error message to the user
        } finally {
            setIsTranslating(false);
        }
    } else {
        setIsKoreanView(prev => !prev);
    }
  };


  const getVideosToExport = () => {
    const sourceVideos = displayVideos;
    if (selectedVideoIds.size > 0) {
      const selectedSet = new Set(selectedVideoIds);
      return sourceVideos.filter(v => selectedSet.has(v.videoId));
    }
    return sourceVideos;
  };

  const downloadFile = (content: string, fileName: string, mimeType: string) => {
    const blob = new Blob(['\uFEFF' + content], { type: mimeType });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCSV = () => {
    const videosToExport = getVideosToExport();
    if (videosToExport.length === 0) return;

    const headers = ['채널명', '영상 제목', '업로드 날짜', '조회수', '좋아요 수', '영상 길이'];
    const escapeCsvCell = (cell: string | number | null | undefined): string => {
        if (cell == null) return '';
        const str = String(cell);
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const rows = videosToExport.map(video => [
        escapeCsvCell(video.channelName),
        escapeCsvCell(video.title),
        new Date(video.uploadDate).toLocaleString('ko-KR'),
        video.viewCount,
        video.likeCount,
        formatDuration(video.durationSeconds)
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    downloadFile(csvContent, 'youtube_search_results.csv', 'text/csv;charset=utf-8;');
  };
  
  const handleDownloadTitles = () => {
    const videosToExport = getVideosToExport();
    if (videosToExport.length === 0) return;
    const titles = videosToExport.map(video => video.title).join('\n');
    downloadFile(titles, 'youtube_video_titles.txt', 'text/plain;charset=utf-8;');
  };

  const handleCopyTags = () => {
    const videosToExport = getVideosToExport();
    if (videosToExport.length === 0) {
        alert('먼저 영상을 선택해주세요.');
        return;
    };

    const allTags = new Set<string>();
    videosToExport.forEach(video => {
        if (video.tags) {
            video.tags.forEach(tag => allTags.add(tag));
        }
    });

    const tagsString = Array.from(allTags).join(', ');
    if (tagsString) {
        navigator.clipboard.writeText(tagsString)
            .then(() => alert(`${allTags.size}개의 고유 태그가 클립보드에 복사되었습니다.`))
            .catch(err => {
                console.error('태그 복사 실패:', err);
                alert('태그를 복사하는 데 실패했습니다.');
            });
    } else {
        alert('복사할 태그가 없습니다.');
    }
  };


  const PaginationControls = () => {
    if (displayVideos.length === 0) return null;
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, displayVideos.length);

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
            <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>표시 단위:</span>
                {[10, 50, 100, 200, 500].map(size => (
                    <button
                        key={size}
                        onClick={() => setItemsPerPage(size)}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                            itemsPerPage === size ? 'bg-red-600 text-white font-bold' : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                    >
                        {size}
                    </button>
                ))}
            </div>
            <div className="flex items-center gap-4">
                <span className="text-sm text-gray-300">
                    결과 {startItem}-{endItem} / {displayVideos.length}개
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        aria-label="이전 페이지"
                    >
                        <ChevronLeftIcon />
                    </button>
                    <span className="text-sm font-semibold text-white w-20 text-center">
                        {currentPage} / {totalPages} 페이지
                    </span>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                        className="p-1.5 rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        aria-label="다음 페이지"
                    >
                        <ChevronRightIcon />
                    </button>
                </div>
            </div>
        </div>
    );
};

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <LoadingSpinner key={index} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-800/50 rounded-lg p-8 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-2xl font-bold text-white mb-2">오류가 발생했습니다</h3>
        <p className="text-gray-400">{error}</p>
      </div>
    );
  }

  if (!hasSearched) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-800/50 rounded-lg p-8 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <h3 className="text-2xl font-bold text-white mb-2">영상을 찾아보세요</h3>
        <p className="text-gray-400">왼쪽 필터를 설정하고 '영상 찾기' 버튼을 눌러 검색을 시작하세요.</p>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-800/50 rounded-lg p-8 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-2xl font-bold text-white mb-2">검색 결과가 없습니다</h3>
        <p className="text-gray-400">검색 필터를 조정하여 다시 시도해 보세요.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                 <input
                    type="checkbox"
                    id="selectAll"
                    ref={selectAllCheckboxRef}
                    onChange={handleSelectAll}
                    className="w-5 h-5 bg-gray-700 border-gray-500 rounded text-red-500 focus:ring-red-600 cursor-pointer"
                />
                <label htmlFor="selectAll" className="text-sm text-gray-300 cursor-pointer">
                    전체 선택 ({selectedVideoIds.size}/{sortedVideos.length})
                </label>
            </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
            {filters.country !== 'any' && filters.country !== 'KR' && videos.length > 0 && (
                <button
                    onClick={handleTranslateToggle}
                    disabled={isTranslating}
                    className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-900/50 disabled:cursor-not-allowed text-white font-bold py-2 px-3 rounded-lg shadow-md transition-all duration-300 text-sm transform hover:scale-105"
                    title={isKoreanView ? '원문 보기' : '한국어로 번역하기'}
                >
                    <LanguageIcon />
                    <span className="hidden sm:inline">
                        {isTranslating ? '번역 중...' : (isKoreanView ? '원문 보기' : '한국어 번역')}
                    </span>
                </button>
            )}
            <button
              onClick={handleDownloadTitles}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg shadow-md transition-all duration-300 text-sm transform hover:scale-105"
              title="선택한 영상 제목 .txt 저장"
            >
              <FileTextIcon />
              <span className="hidden sm:inline">제목만 저장</span>
            </button>
            <button
              onClick={handleCopyTags}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-3 rounded-lg shadow-md transition-all duration-300 text-sm transform hover:scale-105"
              title="선택한 영상의 고유 태그를 클립보드에 복사"
            >
              <TagIcon />
              <span className="hidden sm:inline">태그만 복사</span>
            </button>
            <button
              onClick={handleDownloadCSV}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-lg shadow-md transition-all duration-300 text-sm transform hover:scale-105"
              title="선택한 데이터 .csv 저장 (엑셀)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              <span className="hidden sm:inline">엑셀 다운로드</span>
            </button>
            <div className="flex items-center rounded-lg bg-gray-900/50 p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${
                  viewMode === 'grid' ? 'bg-red-600 text-white shadow' : 'text-gray-400 hover:bg-gray-700'
                }`}
                aria-pressed={viewMode === 'grid'}
              >
                Grid
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${
                  viewMode === 'list' ? 'bg-red-600 text-white shadow' : 'text-gray-400 hover:bg-gray-700'
                }`}
                aria-pressed={viewMode === 'list'}
              >
                List
              </button>
            </div>
        </div>
      </div>
    
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {paginatedVideos.map(video => (
            <VideoCard 
                key={video.videoId} 
                video={video}
                isSelected={selectedVideoIds.has(video.videoId)}
                onSelect={handleSelectVideo} 
            />
          ))}
        </div>
       ) : (
        <ListView 
            videos={paginatedVideos} 
            requestSort={requestSort} 
            sortConfig={sortConfig}
            selectedVideoIds={selectedVideoIds}
            onSelectVideo={handleSelectVideo}
            onSelectAll={handleSelectAll}
            totalVideos={sortedVideos.length}
            channelTags={channelAllTags}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
        />
       )}
       <PaginationControls />
    </>
  );
};

export default ResultsGrid;
