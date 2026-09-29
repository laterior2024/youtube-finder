/**
 * 앱 이름과 버전
 *
 * 규칙: 앱을 업그레이드할 때마다 버전을 0.1씩 올려요. (2.0 → 2.1 → 2.2 …)
 * 올릴 때는 APP_VERSION을 바꾸고, CHANGELOG 맨 위에 무엇이 바뀌었는지 한 줄씩 추가해요.
 */
export const APP_NAME = '인스타그램 게시물 자동생성';
export const APP_VERSION = '2.1';

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

/** 버전별 바뀐 점 (최신이 맨 위) */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.1',
    date: '2026-09-29',
    changes: [
      '화면 색을 밝은 톤(☀️) / 어두운 톤(🌙) 중에서 고를 수 있어요 — 오른쪽 위 버튼을 누르면 바뀌어요',
      '고른 색은 기억해 둬서 다음에 열어도 그대로예요',
    ],
  },
  {
    version: '2.0',
    date: '2026-09-29',
    changes: [
      '앱 이름을 "인스타그램 게시물 자동생성"으로 바꾸고 버전 표시를 시작했어요',
      '지금까지 만든 기능: 10개 나라 현지화 · 게시물 최대 5개 동시 제작 · 인스타 링크 자동 가져오기(Apify)',
      '알고리즘 5구역 설명글 · 해시태그 3~5개 · 대체 텍스트 · 줄별 글자색 · 그라데이션',
      '가져온 사진 크게 보기·저장 · 저작권 안전 점검 · 자동 저장(창이 닫혀도 이어서 작업)',
    ],
  },
];
