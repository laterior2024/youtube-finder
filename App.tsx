
import React, { useState, useCallback, useEffect } from 'react';
import type { SearchFilters, YouTubeVideo, UserRole } from './types';
import { findVideos, findVideosByIds } from './services/geminiService';
import SearchFiltersPanel from './components/SearchFiltersPanel';
import ResultsGrid from './components/ResultsGrid';
import LoginScreen from './components/LoginScreen';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [apiKey, setApiKey] = useState<string>(() => {
    try {
      // 컴포넌트가 처음 마운트될 때 localStorage에서 API 키를 읽어옵니다.
      return localStorage.getItem('youtubeApiKey') || '';
    } catch (error) {
      console.error('localStorage에서 API 키를 읽어오는 데 실패했습니다:', error);
      return '';
    }
  });
  const [filters, setFilters] = useState<SearchFilters>({
    keywords: '',
    minViews: '',
    maxViews: '',
    minLikes: '',
    maxLikes: '',
    minSubscribers: '',
    maxSubscribers: '',
    uploadDate: 'past_week',
    duration: 'any',
    category: 'any',
    tags: '',
    maxResults: 20,
    channelName: '',
    country: 'any',
  });
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState<boolean>(false);
  
  useEffect(() => {
    const savedRole = sessionStorage.getItem('userRole') as UserRole | null;
    if (savedRole) {
      setUserRole(savedRole);
      setIsAuthenticated(true);
    }
  }, []);

  const handleLoginSuccess = (role: UserRole) => {
    sessionStorage.setItem('userRole', role);
    setUserRole(role);
    setIsAuthenticated(true);
  };
  
  const handleLogout = () => {
    sessionStorage.clear();
    setUserRole(null);
    setIsAuthenticated(false);
    // Reset states to default
    setVideos([]);
    setHasSearched(false);
    setError(null);
  };

  const performSearch = useCallback(async (searchFilters: SearchFilters) => {
    if (!apiKey) {
      setError("YouTube API 키를 설정하고 검색을 시작하세요.");
      setHasSearched(true);
      setIsLoading(false);
      setVideos([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const results = await findVideos(searchFilters, apiKey);
      setVideos(results);
    } catch (err) {
      let errorMessage = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      // YouTube API 할당량 초과 오류에 대한 사용자 친화적 메시지
      if (errorMessage.toLowerCase().includes('quota')) {
        errorMessage = 'YouTube API 일일 할당량을 초과했습니다. 할당량은 24시간 후에 자동으로 재설정됩니다. 향후 할당량 소모를 줄이려면, 검색 필터를 더 구체적으로 설정하거나 한 번에 요청하는 최대 영상 수를 줄여보세요.';
      }
      setError(errorMessage);
      setVideos([]);
    } finally {
      setIsLoading(false);
      // On mobile, collapse the filter panel to show results immediately
      if (window.innerWidth < 1024) { // 1024px is Tailwind's 'lg' breakpoint
        setIsFiltersCollapsed(true);
      }
    }
  }, [apiKey]);

  const performSearchByIds = useCallback(async (videoIds: string[]) => {
    if (!apiKey) {
      setError("YouTube API 키를 설정하고 검색을 시작하세요.");
      setHasSearched(true);
      setIsLoading(false);
      setVideos([]);
      return;
    }

    if (videoIds.length === 0) {
      setError("입력된 유효한 동영상 ID 또는 URL이 없습니다.");
      setHasSearched(true);
      setIsLoading(false);
      setVideos([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const results = await findVideosByIds(videoIds, apiKey);
      if (results.length === 0) {
        setError("제공된 ID에 해당하는 동영상을 찾을 수 없거나 ID가 잘못되었습니다.");
      }
      setVideos(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setVideos([]);
    } finally {
      setIsLoading(false);
      if (window.innerWidth < 1024) {
        setIsFiltersCollapsed(true);
      }
    }
  }, [apiKey]);


  const handleSearch = useCallback(() => {
    performSearch(filters);
  }, [filters, performSearch]);

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-screen-2xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-red-600">YouTube</span> 영상 파인더
          </h1>
          <p className="mt-2 text-lg text-gray-400">원하는 영상을 쉽고 빠르게 찾으세요!</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <aside className={`transition-all duration-300 ease-in-out ${isFiltersCollapsed ? 'lg:col-span-1' : 'lg:col-span-3'}`}>
            <SearchFiltersPanel
              apiKey={apiKey}
              setApiKey={setApiKey}
              filters={filters}
              setFilters={setFilters}
              onSearch={handleSearch}
              onSearchByIds={performSearchByIds}
              isLoading={isLoading}
              isCollapsed={isFiltersCollapsed}
              setIsCollapsed={setIsFiltersCollapsed}
              userRole={userRole}
              onLogout={handleLogout}
            />
          </aside>
          
          <main className={`transition-all duration-300 ease-in-out ${isFiltersCollapsed ? 'lg:col-span-11' : 'lg:col-span-9'}`}>
            <ResultsGrid
              videos={videos}
              isLoading={isLoading}
              error={error}
              hasSearched={hasSearched}
              viewMode={viewMode}
              setViewMode={setViewMode}
              filters={filters}
            />
          </main>
        </div>
      </div>
    </div>
  );
};

export default App;
