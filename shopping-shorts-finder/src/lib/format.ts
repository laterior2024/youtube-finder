import type { ResultItem } from '../types';
import { LEVEL_INFO } from './shopping';
import { trendLabel } from './trend';

/** 12345 → "1.2만", 123456789 → "1.2억" */
export function num(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return '-';
  const a = Math.abs(n);
  if (a >= 1e8) return `${trim(n / 1e8)}억`;
  if (a >= 1e4) return `${trim(n / 1e4)}만`;
  if (a >= 1000) return Math.round(n).toLocaleString('ko-KR');
  return a < 10 && n % 1 !== 0 ? n.toFixed(1) : String(Math.round(n));
}

function trim(n: number) {
  return (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('ko-KR');
}

/** 3.456 → "3.5배" */
export function times(n: number | null): string {
  if (n === null || !isFinite(n)) return '-';
  if (n >= 100) return `${Math.round(n).toLocaleString('ko-KR')}배`;
  return `${n >= 10 ? Math.round(n) : Math.round(n * 10) / 10}배`;
}

export function percent(n: number | null): string {
  return n === null ? '-' : `${(n * 100).toFixed(1)}%`;
}

/** 몇 시간 전 → "3시간 전", "2일 전" */
export function ago(hours: number): string {
  if (hours < 1) return '방금';
  if (hours < 24) return `${Math.floor(hours)}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return `${Math.floor(days / 30)}달 전`;
}

export function duration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function videoUrl(r: ResultItem) {
  return r.video.format === 'shorts' ? `https://www.youtube.com/shorts/${r.video.id}` : `https://www.youtube.com/watch?v=${r.video.id}`;
}

/** 결과를 엑셀에서 열 수 있는 CSV 파일로 */
export function toCsv(items: ResultItem[]): string {
  const head = ['떡상점수', '떡상판정', '쇼핑점수', '쇼핑판정', '형태', '제목', '채널', '구독자', '조회수', '하루평균조회수', '구독자대비(배)', '채널평소대비(배)', '반응률(%)', '지난확인후 시간당증가', '올린날짜', '쇼핑몰', '판별근거', '링크'];
  const rows = items.map((r) => [
    r.trend.score,
    trendLabel(r.trend.score).label,
    r.shopping.score,
    LEVEL_INFO[r.shopping.level].label,
    r.video.format === 'shorts' ? '숏폼' : '롱폼',
    r.video.title,
    r.video.channelTitle,
    r.channel?.subs ?? '',
    r.video.views,
    Math.round(r.trend.viewsPerDay),
    r.trend.subRatio?.toFixed(2) ?? '',
    r.trend.channelRatio?.toFixed(2) ?? '',
    r.trend.engagement !== null ? (r.trend.engagement * 100).toFixed(2) : '',
    r.trend.growthPerHour !== null ? Math.round(r.trend.growthPerHour) : '',
    new Date(r.video.publishedAt).toLocaleString('ko-KR'),
    r.shopping.shops.join(' '),
    r.shopping.reasons.map((x) => x.label).join(' / '),
    videoUrl(r),
  ]);
  const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  // 맨 앞의 ﻿는 엑셀이 한글을 안 깨지게 읽도록 붙이는 표시예요.
  return '﻿' + [head, ...rows].map((row) => row.map(esc).join(',')).join('\r\n');
}

export function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
