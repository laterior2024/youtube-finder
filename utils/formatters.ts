
export const formatNumber = (num: number, compact: boolean = false): string => {
  if (compact) {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  }
  return new Intl.NumberFormat('ko-KR').format(num);
};

export const formatDuration = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  const mStr = m.toString().padStart(2, '0');
  const sStr = s.toString().padStart(2, '0');

  if (h > 0) {
    return `${h}:${mStr}:${sStr}`;
  }
  return `${m}:${sStr}`;
};

export const timeAgo = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (isNaN(seconds) || seconds < 0) return '방금 전';
    
    let interval = seconds / 31536000; // years
    if (interval > 1) return `${Math.floor(interval)}년 전`;
    interval = seconds / 2592000; // months
    if (interval > 1) return `${Math.floor(interval)}개월 전`;
    interval = seconds / 86400; // days
    if (interval > 1) return `${Math.floor(interval)}일 전`;
    interval = seconds / 3600; // hours
    if (interval > 1) return `${Math.floor(interval)}시간 전`;
    interval = seconds / 60; // minutes
    if (interval > 1) return `${Math.floor(interval)}분 전`;
    return '방금 전';
  } catch (error) {
    return '알 수 없음';
  }
};

export const formatTimeElapsed = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    if (isNaN(diffMs) || diffMs < 0) return '알 수 없음';

    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    if (totalMinutes < 1) return '방금 전';

    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}일`);
    if (hours > 0) parts.push(`${hours}시간`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}분`);

    return `${parts.join(' ')} 전`;
  } catch (error) {
    return '알 수 없음';
  }
};


export const formatDateTime = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '알 수 없음';
    
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${year}.${month}.${day} ${hours}:${minutes}`;
  } catch (error) {
      return '알 수 없음';
  }
};