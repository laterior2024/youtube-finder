/**
 * 앱 이름과 버전
 *
 * 규칙: 앱을 업그레이드할 때마다 버전을 0.1씩 올려요. (1.0 → 1.1 → 1.2 …)
 * 올릴 때는 APP_VERSION을 바꾸고, CHANGELOG 맨 위에 무엇이 바뀌었는지 한 줄씩 추가해요.
 */
export const APP_NAME = '쇼핑쇼츠 파인더';
export const APP_VERSION = '1.0';

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

/** 버전별 바뀐 점 (최신이 맨 위) */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0',
    date: '2026-09-29',
    changes: [
      '처음 만들었어요 — 유튜브에서 쇼핑 영상(숏폼·롱폼)만 골라 찾아 줘요',
      '영상마다 "쇼핑 영상 점수"를 매겨서 쿠팡·알리 링크, 파트너스 문구, 추천템 같은 말이 있는지 보고 쇼핑 영상만 남겨요',
      '영상마다 "떡상 점수"를 매겨요 — 하루 조회수, 구독자 대비 조회수, 채널 평소 대비 조회수, 좋아요·댓글, 올린 날짜를 모두 봐요',
      '같은 영상을 다시 검색하면 "지난번 확인 이후 시간당 얼마나 늘었는지"도 보여줘요',
      '결과를 엑셀(CSV) 파일로 받을 수 있어요',
    ],
  },
];
