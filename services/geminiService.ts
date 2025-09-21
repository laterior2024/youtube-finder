
import { GoogleGenAI, Type } from "@google/genai";
import type { SearchFilters, YouTubeVideo } from '../types';
import { COUNTRIES } from "../utils/countryUtils";

export const YOUTUBE_CATEGORIES: { name: string; id: string }[] = [
    { name: '영화 & 애니메이션', id: '1' },
    { name: '자동차 & 탈 것', id: '2' },
    { name: '음악', id: '10' },
    { name: '애완동물 & 동물', id: '15' },
    { name: '스포츠', id: '17' },
    { name: '여행 & 이벤트', id: '19' },
    { name: '게임', id: '20' },
    { name: '인물 & 블로그', id: '22' },
    { name: '코미디', id: '23' },
    { name: '엔터테인먼트', id: '24' },
    { name: '뉴스 & 정치', id: '25' },
    { name: '노하우 & 스타일', id: '26' },
    { name: '교육', id: '27' },
    { name: '과학 & 기술', id: '28' },
    { name: '비영리 & 사회운동', id: '29' }
];

const YOUTUBE_CATEGORIES_MAP: { [key: string]: string } = 
    YOUTUBE_CATEGORIES.reduce((acc, cat) => {
        acc[cat.id] = cat.name;
        return acc;
    }, {} as { [key: string]: string });

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

const translateText = async (text: string, targetLanguage: string): Promise<string> => {
    if (!process.env.API_KEY) {
        console.warn("Gemini API key (process.env.API_KEY) not found. Skipping translation.");
        return text;
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    try {
        const prompt = `Translate the following Korean text to ${targetLanguage}. ONLY return the translated text, without any introductory phrases, explanations, or quotes.\n\nText: "${text}"`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
             config: { temperature: 0.2 }
        });

        return response.text.trim();
    } catch (error) {
        console.error('Error translating text with Gemini:', error);
        return text; // Fallback to original text on error
    }
};

export const translateVideosToKorean = async (videos: YouTubeVideo[]): Promise<YouTubeVideo[]> => {
    if (!process.env.API_KEY) {
        console.warn("Gemini API key not found, skipping translation.");
        return videos;
    }

    const videosToTranslate = videos
        .filter(v => !v.koreanTitle) // Only translate if not already translated
        .map(v => ({ videoId: v.videoId, title: v.title, channelName: v.channelName }));

    if (videosToTranslate.length === 0) {
        return videos;
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Translate the 'title' and 'channelName' for each object in the following JSON array to Korean.
    Maintain the original 'videoId'.
    Return ONLY a valid JSON array of objects, where each object contains 'videoId', 'koreanTitle', and 'koreanChannelName'.

    Input:
    ${JSON.stringify(videosToTranslate, null, 2)}
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            videoId: { type: Type.STRING },
                            koreanTitle: { type: Type.STRING },
                            koreanChannelName: { type: Type.STRING },
                        },
                        required: ["videoId", "koreanTitle", "koreanChannelName"]
                    }
                }
            }
        });

        const translatedDataText = response.text.trim();
        const translatedItems: { videoId: string; koreanTitle: string; koreanChannelName: string; }[] = JSON.parse(translatedDataText);

        const translationMap = new Map(translatedItems.map(item => [item.videoId, { koreanTitle: item.koreanTitle, koreanChannelName: item.koreanChannelName }]));

        const updatedVideos = videos.map(video => {
            if (translationMap.has(video.videoId)) {
                return { ...video, ...translationMap.get(video.videoId)! };
            }
            return video;
        });

        return updatedVideos;

    } catch (error) {
        console.error("Error translating video details with Gemini:", error);
        return videos;
    }
};


const getPublishedAfterDate = (uploadDateFilter: string): string | null => {
    const now = new Date();
    switch (uploadDateFilter) {
        case 'past_24_hours': now.setDate(now.getDate() - 1); break;
        case 'past_week': now.setDate(now.getDate() - 7); break;
        case 'past_month': now.setMonth(now.getMonth() - 1); break;
        case 'past_year': now.setFullYear(now.getFullYear() - 1); break;
        default: return null;
    }
    return now.toISOString();
};

const parseISODuration = (isoDuration: string): number => {
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = isoDuration.match(regex);
    if (!matches) return 0;
    const hours = parseInt(matches[1] || '0', 10);
    const minutes = parseInt(matches[2] || '0', 10);
    const seconds = parseInt(matches[3] || '0', 10);
    return (hours * 3600) + (minutes * 60) + seconds;
};

const extractVideoId = (urlOrId: string): string | null => {
    if (!urlOrId) return null;
    const trimmed = urlOrId.trim();
    
    // Case 1: Raw 11-character ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
        return trimmed;
    }

    // Case 2: Standard YouTube URLs
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = trimmed.match(regex);
    
    return match ? match[1] : null;
};

export const findVideos = async (filters: SearchFilters, apiKey: string): Promise<YouTubeVideo[]> => {
    const API_KEY = apiKey;
    const finalResults: YouTubeVideo[] = [];
    let nextPageToken: string | undefined = undefined;
    // YouTube API 할당량 초과 오류를 방지하기 위해 최대 탐색 페이지 수를 5로 제한합니다. (검색 1회당 약 250개 동영상)
    const MAX_PAGES_TO_FETCH = 5;
    let pagesFetched = 0;
    
    let effectiveKeywords = filters.keywords || '';
    const countryInfo = COUNTRIES.find(c => c.code === filters.country);

    if (filters.country && filters.country !== 'any' && countryInfo?.language && effectiveKeywords) {
        effectiveKeywords = await translateText(effectiveKeywords, countryInfo.language);
    }
    
    const query = `${effectiveKeywords} ${filters.tags || ''} ${filters.channelName || ''}`.trim();

    do {
        // 1. API가 직접 지원하는 필터를 기반으로 동영상 ID 검색
        const searchParams = new URLSearchParams({
            part: 'snippet',
            q: query,
            type: 'video',
            maxResults: '50', // 항상 최대로 가져와서 필터링 효율 높이기
            key: API_KEY,
            relevanceLanguage: 'ko',
        });
        
        if (filters.country && filters.country !== 'any') {
            searchParams.append('regionCode', filters.country);
        } else {
             searchParams.append('regionCode', 'KR');
        }

        if (filters.duration !== 'any') searchParams.append('videoDuration', filters.duration);
        if (filters.category !== 'any') searchParams.append('videoCategoryId', filters.category);
        
        const publishedAfter = getPublishedAfterDate(filters.uploadDate);
        if (publishedAfter) searchParams.append('publishedAfter', publishedAfter);

        if (nextPageToken) searchParams.append('pageToken', nextPageToken);

        const searchResponse = await fetch(`${BASE_URL}/search?${searchParams.toString()}`);
        if (!searchResponse.ok) {
            const errorData = await searchResponse.json();
            throw new Error(`YouTube 검색 API 오류: ${errorData.error.message}`);
        }
        const searchData = await searchResponse.json();
        const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');

        if (!videoIds) break; // 검색 결과 없으면 중단

        // 2. 찾은 동영상 ID에 대한 상세 동영상 통계 가져오기
        const videosParams = new URLSearchParams({
            part: 'snippet,statistics,contentDetails',
            id: videoIds,
            key: API_KEY,
            hl: 'ko'
        });
        const videosResponse = await fetch(`${BASE_URL}/videos?${videosParams.toString()}`);
        if (!videosResponse.ok) {
            const errorData = await videosResponse.json();
            throw new Error(`YouTube 동영상 API 오류: ${errorData.error.message}`);
        }
        const videosData = await videosResponse.json();

        // 3. 고유한 채널 ID에 대한 채널 통계 및 정보 가져오기
        const channelIds = [...new Set(videosData.items.map((video: any) => video.snippet.channelId))].join(',');
        if (!channelIds) continue; // 채널 ID 없으면 다음 페이지로

        const channelsParams = new URLSearchParams({ part: 'statistics,snippet', id: channelIds, key: API_KEY });
        const channelsResponse = await fetch(`${BASE_URL}/channels?${channelsParams.toString()}`);
         if (!channelsResponse.ok) {
            const errorData = await channelsResponse.json();
            throw new Error(`YouTube 채널 API 오류: ${errorData.error.message}`);
        }
        const channelsData = await channelsResponse.json();
        const subscriberMap = new Map<string, number>();
        const countryMap = new Map<string, string>();
        
        channelsData.items.forEach((ch: any) => {
            subscriberMap.set(ch.id, parseInt(ch.statistics.subscriberCount, 10) || 0);
            countryMap.set(ch.id, ch.snippet.country || 'N/A');
        });

        // 4. 모든 데이터를 결합하고 클라이언트 측 필터 적용
        const combinedData = videosData.items.map((video: any): YouTubeVideo => ({
            videoId: video.id,
            channelId: video.snippet.channelId,
            title: video.snippet.title,
            channelName: video.snippet.channelTitle,
            viewCount: parseInt(video.statistics.viewCount, 10) || 0,
            likeCount: parseInt(video.statistics.likeCount, 10) || 0,
            commentCount: parseInt(video.statistics.commentCount, 10) || 0,
            durationSeconds: parseISODuration(video.contentDetails.duration),
            uploadDate: video.snippet.publishedAt,
            thumbnailUrl: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.medium?.url,
            channelSubscriberCount: subscriberMap.get(video.snippet.channelId) || 0,
            channelCountry: countryMap.get(video.snippet.channelId) || 'N/A',
            tags: video.snippet.tags || [],
            category: YOUTUBE_CATEGORIES_MAP[video.snippet.categoryId] || '알 수 없음',
        }));

        const tagKeywords = filters.tags ? filters.tags.toLowerCase().split(',').map(t => t.trim()).filter(Boolean) : [];

        const newlyFilteredVideos = combinedData.filter(video => 
            (filters.country === 'any' || video.channelCountry === filters.country) &&
            (tagKeywords.length === 0 || tagKeywords.every(tagKeyword => 
                video.tags.some(videoTag => videoTag.toLowerCase().includes(tagKeyword))
            )) &&
            (filters.minViews === '' || video.viewCount >= Number(filters.minViews)) &&
            (filters.maxViews === '' || video.viewCount <= Number(filters.maxViews)) &&
            (filters.minLikes === '' || video.likeCount >= Number(filters.minLikes)) &&
            (filters.maxLikes === '' || video.likeCount <= Number(filters.maxLikes)) &&
            (filters.minSubscribers === '' || video.channelSubscriberCount >= Number(filters.minSubscribers)) &&
            (filters.maxSubscribers === '' || video.channelSubscriberCount <= Number(filters.maxSubscribers)) &&
            (filters.channelName === '' || video.channelName.toLowerCase().includes(filters.channelName.toLowerCase()))
        );

        finalResults.push(...newlyFilteredVideos);
        
        nextPageToken = searchData.nextPageToken;
        pagesFetched++;

    } while (finalResults.length < filters.maxResults && nextPageToken && pagesFetched < MAX_PAGES_TO_FETCH);

    const uniqueVideosMap = new Map<string, YouTubeVideo>();
    for (const video of finalResults) {
        if (!uniqueVideosMap.has(video.videoId)) {
            uniqueVideosMap.set(video.videoId, video);
        }
    }
    const uniqueResults = Array.from(uniqueVideosMap.values());

    return uniqueResults.slice(0, filters.maxResults);
};

export const findVideosByIds = async (videoIds: string[], apiKey: string): Promise<YouTubeVideo[]> => {
    const API_KEY = apiKey;
    const finalResults: YouTubeVideo[] = [];
    const uniqueIds = [...new Set(videoIds.map(extractVideoId).filter(Boolean) as string[])];
    
    if (uniqueIds.length === 0) {
        return [];
    }

    // Batch requests in chunks of 50, as per YouTube API limit
    const CHUNK_SIZE = 50;
    for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
        const idChunk = uniqueIds.slice(i, i + CHUNK_SIZE);
        const videoIdsString = idChunk.join(',');

        // 1. Get video details for the chunk
        const videosParams = new URLSearchParams({
            part: 'snippet,statistics,contentDetails',
            id: videoIdsString,
            key: API_KEY,
            hl: 'ko'
        });
        const videosResponse = await fetch(`${BASE_URL}/videos?${videosParams.toString()}`);
        if (!videosResponse.ok) {
            const errorData = await videosResponse.json();
            console.error(`YouTube Videos API error for IDs ${videoIdsString}:`, errorData.error.message);
            continue; // Skip this chunk on error
        }
        const videosData = await videosResponse.json();

        if (!videosData.items || videosData.items.length === 0) {
            continue;
        }

        // 2. Get channel details for the videos in the chunk
        const channelIds = [...new Set(videosData.items.map((video: any) => video.snippet.channelId))].join(',');
        if (!channelIds) continue;

        const channelsParams = new URLSearchParams({ part: 'statistics,snippet', id: channelIds, key: API_KEY });
        const channelsResponse = await fetch(`${BASE_URL}/channels?${channelsParams.toString()}`);
        if (!channelsResponse.ok) {
            const errorData = await channelsResponse.json();
             console.error(`YouTube 채널 API 오류: ${errorData.error.message}`);
            // Continue without channel data if this fails
        }
        
        const channelsData = await channelsResponse.json();
        const subscriberMap = new Map<string, number>();
        const countryMap = new Map<string, string>();
        
        if (channelsData.items) {
          channelsData.items.forEach((ch: any) => {
              subscriberMap.set(ch.id, parseInt(ch.statistics.subscriberCount, 10) || 0);
              countryMap.set(ch.id, ch.snippet.country || 'N/A');
          });
        }

        // 3. Combine data
        const combinedData = videosData.items.map((video: any): YouTubeVideo => ({
            videoId: video.id,
            channelId: video.snippet.channelId,
            title: video.snippet.title,
            channelName: video.snippet.channelTitle,
            viewCount: parseInt(video.statistics.viewCount, 10) || 0,
            likeCount: parseInt(video.statistics.likeCount, 10) || 0,
            commentCount: parseInt(video.statistics.commentCount, 10) || 0,
            durationSeconds: parseISODuration(video.contentDetails.duration),
            uploadDate: video.snippet.publishedAt,
            thumbnailUrl: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.medium?.url,
            channelSubscriberCount: subscriberMap.get(video.snippet.channelId) || 0,
            channelCountry: countryMap.get(video.snippet.channelId) || 'N/A',
            tags: video.snippet.tags || [],
            category: YOUTUBE_CATEGORIES_MAP[video.snippet.categoryId] || '알 수 없음',
        }));

        finalResults.push(...combinedData);
    }
    
    return finalResults;
};
