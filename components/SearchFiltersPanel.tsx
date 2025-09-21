
import React, { useState, useEffect, useRef } from 'react';
import type { SearchFilters, UserRole } from '../types';
import { YOUTUBE_CATEGORIES } from '../services/geminiService';
import { COUNTRIES } from '../utils/countryUtils';
import { LockClosedIcon, LockOpenIcon, ChevronLeftIcon, ChevronRightIcon, KeyIcon, TrashIcon, PlusIcon, UploadIcon } from './icons/ActionIcons';

// --- Constants ---
const DEFAULT_ADMIN_PASSWORD = '256008';
const ADMIN_PASSWORD_KEY = 'adminPassword';
const GUEST_ACCOUNTS_KEY = 'guestAccounts';

interface GuestAccount {
  id: string;
  name: string;
  pass: string;
}

// --- Modal Component ---
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
    }

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 transition-opacity" aria-modal="true" role="dialog">
      <div ref={modalRef} className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-lg m-4 transform transition-transform scale-95 animate-scale-in">
        <header className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label="Close modal">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="p-6">
          {children}
        </div>
      </div>
       <style>{`
        @keyframes scale-in {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out forwards;
        }
      `}</style>
    </div>
  );
};


// --- Helper components ---

type HandleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;

const InputField: React.FC<{
  label?: string;
  name: string;
  value: string | number;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  type?: string;
  placeholder?: string;
  className?: string;
}> = ({ label, name, value, onChange, type = 'text', placeholder, className }) => (
  <div>
    {label && <label htmlFor={name} className="block text-sm font-medium text-gray-300 mb-1">{label}</label>}
    <input
      id={name}
      name={name}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition ${className}`}
    />
  </div>
);

const RangeField: React.FC<{
  label: string;
  minName: string;
  maxName: string;
  minValue: number | '';
  maxValue: number | '';
  onChange: HandleChange;
}> = ({ label, minName, maxName, minValue, maxValue, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
    <div className="flex items-center space-x-2">
      <input name={minName} type="number" value={minValue} onChange={onChange} placeholder="최소" className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition" />
      <span className="text-gray-400">-</span>
      <input name={maxName} type="number" value={maxValue} onChange={onChange} placeholder="최대" className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition" />
    </div>
  </div>
);

const SelectField: React.FC<{
  label: string;
  name: string;
  value: string | number;
  options: { value: string | number; label: string }[];
  onChange: HandleChange;
}> = ({ label, name, value, options, onChange }) => (
  <div>
    <label htmlFor={name} className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
    <select
      id={name}
      name={name}
      value={value}
      onChange={onChange}
      className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

const TabButton: React.FC<{ title: string; isActive: boolean; onClick: () => void }> = ({ title, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-semibold transition-colors focus:outline-none ${
      isActive
        ? 'text-white border-b-2 border-red-500'
        : 'text-gray-400 hover:text-white'
    }`}
  >
    {title}
  </button>
);


// --- Main component ---

interface SearchFiltersPanelProps {
  apiKey: string;
  setApiKey: React.Dispatch<React.SetStateAction<string>>;
  filters: SearchFilters;
  setFilters: React.Dispatch<React.SetStateAction<SearchFilters>>;
  onSearch: () => void;
  onSearchByIds: (videoIds: string[]) => void;
  isLoading: boolean;
  isCollapsed: boolean;
  setIsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  userRole: UserRole | null;
  onLogout: () => void;
}

const SearchFiltersPanel: React.FC<SearchFiltersPanelProps> = ({ apiKey, setApiKey, filters, setFilters, onSearch, onSearchByIds, isLoading, isCollapsed, setIsCollapsed, userRole, onLogout }) => {
  const [isKeySaved, setIsKeySaved] = useState<boolean>(!!apiKey);
  const [maxResultsSelection, setMaxResultsSelection] = useState<string>(filters.maxResults.toString());
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<'filter' | 'id'>('filter');
  const [idInput, setIdInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  
  // Account Management State
  const [adminPass, setAdminPass] = useState('');
  const [guestAccounts, setGuestAccounts] = useState<GuestAccount[]>([]);
  const [newGuestName, setNewGuestName] = useState('');
  const [newGuestPass, setNewGuestPass] = useState('');

  // Sync max results select with filters state
  useEffect(() => {
    const presetValues = ['10', '20', '30', '50', '100', '500', '1000'];
    if (presetValues.includes(filters.maxResults.toString())) {
      setMaxResultsSelection(filters.maxResults.toString());
    } else {
      setMaxResultsSelection('custom');
    }
  }, [filters.maxResults]);
  
  // Load guest accounts when modal opens
  useEffect(() => {
      if (isAccountModalOpen) {
          try {
              const storedGuests = localStorage.getItem(GUEST_ACCOUNTS_KEY);
              if (storedGuests) {
                  setGuestAccounts(JSON.parse(storedGuests));
              } else {
                  setGuestAccounts([]);
              }
          } catch (e) {
              console.error("Failed to parse guest accounts:", e);
              setGuestAccounts([]);
          }
      }
  }, [isAccountModalOpen]);

  const handleInputChange: HandleChange = (e) => {
    const { name, value } = e.target;
    const isNumeric = ['minViews', 'maxViews', 'minLikes', 'maxLikes', 'minSubscribers', 'maxSubscribers', 'maxResults'].includes(name);
    setFilters(prev => ({ ...prev, [name]: isNumeric && value ? Number(value) : value }));
  };

  const handleMaxResultsSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = e.target;
    setMaxResultsSelection(value);
    if (value !== 'custom') {
      setFilters(prev => ({ ...prev, maxResults: Number(value) }));
    }
  };
  
  const handleApiKeyAction = () => {
    if (isKeySaved) {
        setIsKeySaved(false);
        alert('API 키가 잠금 해제되었습니다. 이제 수정 후 다시 잠글 수 있습니다.');
    } else {
        if (!apiKey.trim()) {
            alert('먼저 API 키를 입력해주세요.');
            return;
        }
        try {
            localStorage.setItem('youtubeApiKey', apiKey);
            setIsKeySaved(true);
            alert('API 키가 안전하게 저장 및 잠금되었습니다.');
        } catch (error) {
            console.error("Failed to save to localStorage:", error);
            alert('API 키를 저장하는 데 실패했습니다. 브라우저 설정을 확인해주세요.');
        }
    }
  };

  // --- Account Management Handlers ---

 const handleSaveAdminPassword = () => {
    const newPassword = adminPass.trim();
    if (!newPassword) {
        alert('새 관리자 비밀번호를 입력해주세요.');
        return;
    }
    if (newPassword.length < 6) {
        alert('관리자 비밀번호는 6자 이상이어야 합니다.');
        return;
    }
    localStorage.setItem(ADMIN_PASSWORD_KEY, newPassword);
    alert('관리자 비밀번호가 변경되었습니다.');
    setAdminPass('');
  };

  const handleAddGuest = () => {
    const name = newGuestName.trim();
    const pass = newGuestPass.trim();

    if (!name || !pass) {
        alert('게스트 아이디와 비밀번호를 모두 입력해주세요.');
        return;
    }
    if (pass.length < 6) {
        alert('게스트 비밀번호는 6자 이상이어야 합니다.');
        return;
    }
    if (guestAccounts.some(acc => acc.name === name)) {
        alert('이미 사용 중인 아이디입니다.');
        return;
    }

    const newAccount: GuestAccount = { id: Date.now().toString(), name, pass };
    const updatedAccounts = [...guestAccounts, newAccount];
    
    setGuestAccounts(updatedAccounts);
    localStorage.setItem(GUEST_ACCOUNTS_KEY, JSON.stringify(updatedAccounts));
    
    setNewGuestName('');
    setNewGuestPass('');
  };
  
  const handleRemoveGuest = (idToRemove: string) => {
    if (window.confirm("이 게스트 계정을 정말 삭제하시겠습니까?")) {
        const updatedAccounts = guestAccounts.filter(acc => acc.id !== idToRemove);
        setGuestAccounts(updatedAccounts);
        localStorage.setItem(GUEST_ACCOUNTS_KEY, JSON.stringify(updatedAccounts));
    }
  };
  
  // --- ID/URL Search Handlers ---
  const handleIdSearch = () => {
    const ids = idInput.split('\n').filter(line => line.trim() !== '');
    if (ids.length > 0) {
        onSearchByIds(ids);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = (event) => {
              const text = event.target?.result as string;
              setIdInput(text);
          };
          reader.readAsText(file);
      }
      e.target.value = ''; // Reset file input
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          const file = e.dataTransfer.files[0];
          if (file.type === 'text/plain' || file.type === 'text/csv' || !file.type) {
               const reader = new FileReader();
               reader.onload = (event) => {
                   const text = event.target?.result as string;
                   setIdInput(text);
               };
               reader.readAsText(file);
          } else {
              alert('TXT 또는 CSV 파일만 지원됩니다.');
          }
      }
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-2xl sticky top-8 h-full flex flex-col">
        <div className={`flex ${isCollapsed ? 'justify-center' : 'justify-between'} items-center mb-6`}>
            <div className={`flex items-center gap-4 transition-opacity duration-300 ${isCollapsed ? 'hidden' : 'block'}`}>
                <h2 className="text-2xl font-bold text-white">검색 옵션</h2>
                <button onClick={onLogout} className="text-sm text-gray-400 hover:text-red-400 transition-colors">로그아웃</button>
            </div>
            <button onClick={() => setIsCollapsed(!isCollapsed)} title={isCollapsed ? "필터 열기" : "필터 접기"} className="p-1 hover:bg-gray-700 rounded-full">
                {isCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </button>
        </div>
      
      <div className={`flex-grow overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-full opacity-100'}`}>
        <div className="flex border-b border-gray-700 mb-4">
            <TabButton title="필터 검색" isActive={searchMode === 'filter'} onClick={() => setSearchMode('filter')} />
            <TabButton title="ID/URL 검색" isActive={searchMode === 'id'} onClick={() => setSearchMode('id')} />
        </div>
        
        {searchMode === 'filter' ? (
            <form onSubmit={(e) => { e.preventDefault(); onSearch(); }} className="h-full flex flex-col">
              <div className="space-y-6 flex-grow">
                {userRole === 'admin' && (
                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-4">
                      <h3 className="text-lg font-semibold text-white -mt-1 mb-3">관리자 설정</h3>
                      <div>
                        <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300 mb-1">YouTube API 키</label>
                        <div className="flex items-center gap-2">
                            <input
                            id="apiKey"
                            name="apiKey"
                            type={isKeySaved ? "password" : "text"}
                            value={isKeySaved ? '●●●●●●●●●●●●●●●●●●●●' : apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="API 키를 여기에 입력하세요"
                            disabled={isKeySaved}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-describedby="api-key-description"
                            />
                            <button type="button" onClick={handleApiKeyAction} title={isKeySaved ? "API 키 잠금 해제" : "API 키 저장 및 잠금"}>
                            {isKeySaved ? <LockClosedIcon className="text-green-500" /> : <LockOpenIcon className="text-red-500" />}
                            </button>
                        </div>
                        <p id="api-key-description" className="mt-1 text-xs text-gray-500">
                            {isKeySaved ? 'API 키가 저장 및 잠금되었습니다.' : '키 입력 후 자물쇠를 눌러 저장하세요.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsAccountModalOpen(true)}
                        className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                      >
                        <KeyIcon />
                        계정 관리
                      </button>
                    </div>
                )}
                <InputField label="키워드" name="keywords" value={filters.keywords} onChange={handleInputChange} placeholder="예: AI, 게임" />
                 <SelectField
                  label="국가 (키워드 자동 번역)"
                  name="country"
                  value={filters.country}
                  onChange={handleInputChange}
                  options={COUNTRIES.map(c => ({ value: c.code, label: c.name }))}
                />
                <InputField label="채널명" name="channelName" value={filters.channelName} onChange={handleInputChange} placeholder="예: Google Developers" />
                
                <div>
                    <SelectField
                        label="최대 영상 수"
                        name="maxResults"
                        value={maxResultsSelection}
                        onChange={handleMaxResultsSelectChange}
                        options={[
                            ...[10, 20, 30, 50, 100, 500, 1000].map(n => ({ value: n.toString(), label: `${n}개` })),
                            { value: 'custom', label: '직접 입력' }
                        ]}
                    />
                    {maxResultsSelection === 'custom' && (
                        <div className="mt-2">
                            <InputField
                                name="maxResults"
                                type="number"
                                value={filters.maxResults}
                                onChange={handleInputChange}
                                placeholder="원하는 개수 입력"
                            />
                        </div>
                    )}
                </div>

                <RangeField label="조회수" minName="minViews" maxName="maxViews" minValue={filters.minViews} maxValue={filters.maxViews} onChange={handleInputChange} />
                <RangeField label="좋아요 수" minName="minLikes" maxName="maxLikes" minValue={filters.minLikes} maxValue={filters.maxLikes} onChange={handleInputChange} />
                <RangeField label="채널 구독자 수" minName="minSubscribers" maxName="maxSubscribers" minValue={filters.minSubscribers} maxValue={filters.maxSubscribers} onChange={handleInputChange} />
                <SelectField
                  label="업로드 날짜"
                  name="uploadDate"
                  value={filters.uploadDate}
                  onChange={handleInputChange}
                  options={[
                    { value: 'any', label: '전체 기간' },
                    { value: 'past_24_hours', label: '지난 24시간' },
                    { value: 'past_week', label: '지난 1주' },
                    { value: 'past_month', label: '지난 1개월' },
                    { value: 'past_year', label: '지난 1년' },
                  ]}
                />
                <SelectField
                  label="영상 길이"
                  name="duration"
                  value={filters.duration}
                  onChange={handleInputChange}
                  options={[
                    { value: 'any', label: '모든 길이' },
                    { value: 'short', label: '짧은 영상 (< 4분)' },
                    { value: 'medium', label: '중간 길이 (4-20분)' },
                    { value: 'long', label: '긴 영상 (> 20분)' },
                  ]}
                />
                <SelectField 
                    label="카테고리" 
                    name="category" 
                    value={filters.category} 
                    onChange={handleInputChange}
                    options={[
                        { value: 'any', label: '모든 카테고리' },
                        ...YOUTUBE_CATEGORIES.map(cat => ({ value: cat.id, label: cat.name }))
                    ]} 
                />
                <InputField label="태그로 검색하기" name="tags" value={filters.tags} onChange={handleInputChange} placeholder="쉼표(,)로 구분하여 태그 입력" />
              </div>
              
              <div className="border-t border-gray-700 pt-6 mt-6">
                <button
                    type="submit"
                    disabled={isLoading || !apiKey}
                    className="w-full flex justify-center items-center bg-red-600 hover:bg-red-700 disabled:bg-red-900/50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105"
                >
                    {isLoading ? (
                    <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        검색 중...
                    </>
                    ) : '영상 찾기'}
                </button>
              </div>
            </form>
        ) : (
            <div className="h-full flex flex-col space-y-4">
              <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center ${isDragging ? 'border-red-500 bg-gray-700/50' : 'border-gray-600 hover:border-gray-500'}`}
                  onClick={() => document.getElementById('file-upload')?.click()}
              >
                  <UploadIcon />
                  <p className="mt-2 text-sm text-gray-400">파일을 드래그하거나 클릭하여 업로드</p>
                  <p className="text-xs text-gray-500">.txt, .csv 지원</p>
                  <input id="file-upload" type="file" className="hidden" accept=".txt,.csv,text/plain,text/csv" onChange={handleFileChange} />
              </div>

              <div className="relative flex-grow">
                  <textarea
                      value={idInput}
                      onChange={(e) => setIdInput(e.target.value)}
                      placeholder="또는 여기에 동영상 ID/URL 목록을 한 줄에 하나씩 붙여넣으세요."
                      className="w-full h-full min-h-[200px] bg-gray-700 border border-gray-600 rounded-md p-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition resize-y custom-scrollbar"
                  />
              </div>

              <div className="pt-2">
                  <button
                      type="button"
                      onClick={handleIdSearch}
                      disabled={isLoading || !apiKey || idInput.trim() === ''}
                      className="w-full flex justify-center items-center bg-red-600 hover:bg-red-700 disabled:bg-red-900/50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105"
                  >
                      {isLoading ? (
                         <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            검색 중...
                        </>
                      ) : 'ID로 영상 찾기'}
                  </button>
              </div>
            </div>
        )}
      </div>
      
      <Modal 
        isOpen={isAccountModalOpen} 
        onClose={() => setIsAccountModalOpen(false)}
        title="계정 관리"
      >
        <div className="space-y-8">
          {/* Admin Password Section */}
          <div className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-200 border-b border-gray-700 pb-2">관리자 비밀번호</h3>
              <div className="flex items-center gap-3">
                  <InputField
                      name="adminPassword"
                      type="password"
                      value={adminPass}
                      onChange={(e) => setAdminPass(e.target.value)}
                      placeholder="새 관리자 비밀번호 (6자 이상)"
                  />
                  <button
                      type="button"
                      onClick={handleSaveAdminPassword}
                      className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg transition-colors flex-shrink-0"
                  >
                      저장
                  </button>
              </div>
          </div>
          
          {/* Guest Accounts Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-200 border-b border-gray-700 pb-2">게스트 계정 관리</h3>
            
            {/* Guest List */}
            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                {guestAccounts.length > 0 ? (
                    guestAccounts.map(acc => (
                        <div key={acc.id} className="flex items-center justify-between bg-gray-700/50 p-2 rounded-md">
                            <span className="font-mono text-gray-300">{acc.name}</span>
                            <button 
                                onClick={() => handleRemoveGuest(acc.id)} 
                                className="text-red-500 hover:text-red-400 p-1 rounded-full transition-colors"
                                title={`${acc.name} 계정 삭제`}
                            >
                                <TrashIcon />
                            </button>
                        </div>
                    ))
                ) : (
                    <p className="text-center text-gray-500 py-4">생성된 게스트 계정이 없습니다.</p>
                )}
            </div>

            {/* Add New Guest Form */}
            <div className="border-t border-gray-700 pt-4 space-y-3">
                 <h4 className="font-semibold text-gray-300">새 게스트 추가</h4>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                     <InputField
                        name="newGuestName"
                        value={newGuestName}
                        onChange={(e) => setNewGuestName(e.target.value)}
                        placeholder="게스트 아이디"
                    />
                    <InputField
                        name="newGuestPass"
                        type="password"
                        value={newGuestPass}
                        onChange={(e) => setNewGuestPass(e.target.value)}
                        placeholder="게스트 비밀번호"
                    />
                 </div>
                 <button
                    type="button"
                    onClick={handleAddGuest}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                    <PlusIcon />
                    추가
                </button>
            </div>
          </div>

          <div className="border-t border-gray-700 pt-4 flex justify-end">
              <button
                  type="button"
                  onClick={() => setIsAccountModalOpen(false)}
                  className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                  닫기
              </button>
          </div>
        </div>
      </Modal>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #4A5568; /* gray-700 */
          border-radius: 20px;
          border: 2px solid transparent;
          background-clip: content-box;
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
  );
};

export default SearchFiltersPanel;
