import type { Reason, ShoppingLevel, ShoppingVerdict, VideoItem } from '../types';

/**
 * 🛒 쇼핑 영상 판별기
 *
 * 유튜브에는 "쇼핑" 카테고리가 없어요. (쇼핑 영상은 대부분 '노하우/스타일'이나 '인물/블로그'에 섞여 있어요.)
 * 그래서 사람이 영상 설명란을 보고 판단하듯이, 아래 단서를 찾아서 점수를 매겨요.
 *
 *  1) 설명란에 쇼핑몰 링크가 있나?        (쿠팡 · 네이버 스마트스토어 · 알리 · 테무 · 아마존 …)  ← 가장 확실
 *  2) "쿠팡 파트너스 활동의 일환으로 …" 같은 제휴 수수료 문구가 있나?                     ← 아주 확실
 *  3) 유튜브의 "유료 광고 포함" 표시가 켜져 있나?
 *  4) 제목·태그에 추천템 · 내돈내산 · 언박싱 · 하울 같은 쇼핑 말이 있나?
 *  5) 설명란에 "구매 링크", "할인 코드" 같은 말이 있나?
 *  6) 음악 · 게임 · 뉴스 분야면 점수를 깎아요.
 *
 * 합계 50점 이상 = 쇼핑 확실 / 30점 이상 = 쇼핑 같음 / 15점 이상 = 애매 / 그 아래 = 쇼핑 아님
 */

/** 쇼핑몰 주소 → 이름 */
const SHOPS: [RegExp, string][] = [
  [/link\.coupang\.com|coupa\.ng|coupang\.com/i, '쿠팡'],
  [/smartstore\.naver\.com|brand\.naver\.com|shopping\.naver\.com|shoppingconnect|naver\.me/i, '네이버쇼핑'],
  [/aliexpress\.|ali\.ski|s\.click\.ali/i, '알리'],
  [/temu\.(com|to)/i, '테무'],
  [/amzn\.(to|asia)|amazon\.(com|co\.jp|co\.uk|de)/i, '아마존'],
  [/11st\.co\.kr/i, '11번가'],
  [/gmarket\.co\.kr|auction\.co\.kr/i, 'G마켓·옥션'],
  [/oliveyoung\.co\.kr|oy\.run/i, '올리브영'],
  [/musinsa\.com/i, '무신사'],
  [/29cm\.co\.kr|a-bly\.com|zigzag\.kr|kurly\.com|ohou\.se|ssg\.com|lotteon\.com|tmon\.co\.kr|wemakeprice\.com/i, '국내 쇼핑몰'],
  [/shein\.com|iherb\.com|qoo10\.|shopee\.|tiktok\.com\/(view\/)?product|shop\.tiktok/i, '해외 쇼핑몰'],
  [/rakuten|a\.r10\.to|hb\.afl\.rakuten/i, '라쿠텐'],
];

/** 링크 모음 페이지 (쇼핑 링크를 모아두는 곳) */
const LINK_HUB = /linktr\.ee|litt\.ly|link\.inpock|inpk\.link|beacons\.ai|lit\.link/i;

/** 제휴 수수료 문구 */
const AFFILIATE =
  /쿠팡\s*파트너스|파트너스\s*활동|일정액의\s*수수료|수수료를\s*(제공|지급)\s*받|제휴\s*마케팅|쇼핑\s*커넥트|as an amazon associate|affiliate|commission|アフィリエイト/i;

/** 광고·협찬 문구 */
const SPONSORED = /유료\s*광고|협찬|광고\s*포함|제품\s*(을\s*)?제공\s*받|#ad\b|#sponsored|sponsored|pr\s*案件|提供/i;

/** 설명란의 구매 안내 말 */
const BUY_WORDS =
  /구매\s*링크|제품\s*링크|상품\s*링크|구매처|구입처|제품\s*정보|할인\s*코드|쿠폰|최저가|구매하기|shop now|buy (it )?here|link in (my )?bio|購入はこちら|商品リンク/i;

/** 제목·태그의 강한 쇼핑 말 (하나에 20점) */
const STRONG_WORDS: [RegExp, string][] = [
  [/내돈내산/, '내돈내산'],
  [/추천템|꿀템|살림템|필수템|육아템|자취템|주방템|뷰티템|득템|꿀템추천/, '○○템'],
  [/쿠팡/, '쿠팡'],
  [/다이소/, '다이소'],
  [/알리익스프레스|알리\s?(추천|꿀템|직구|구매|쇼핑|에서)|테무/, '알리·테무'],
  [/올리브영|올영/, '올리브영'],
  [/언박싱|개봉기|unboxing|開封/i, '언박싱'],
  [/하울|haul|購入品/i, '하울'],
  [/핫딜|최저가|특가|세일|할인/, '할인·핫딜'],
  [/amazon finds|amazon must|tiktok made me buy|must.?haves?|買ってよかった|便利グッズ/i, '추천템(해외)'],
];

/** 제목·태그의 약한 쇼핑 말 (하나에 8점) */
const WEAK_WORDS: [RegExp, string][] = [
  [/추천|recommend|おすすめ/i, '추천'],
  [/리뷰|후기|review|レビュー/i, '리뷰'],
  [/가성비|worth it|コスパ/i, '가성비'],
  [/제품|상품|아이템|product|gadget|가젯|ガジェット/i, '제품'],
  [/구매|샀|사야|사지\s?마|buy|bought|買/i, '구매'],
  [/신상|new arrival/i, '신상'],
  [/비교|vs\b/i, '비교'],
  [/선물|gift/i, '선물'],
];

/** 쇼핑이 아닐 가능성이 큰 말 */
const NEGATIVE = /뮤직\s*비디오|\bM\/?V\b|official video|게임\s*플레이|공략|배그|마인크래프트|속보|뉴스|정치|직캠|fancam|노래\s*커버/i;

/** 유튜브 카테고리 번호 */
const GOOD_CATEGORIES: Record<string, number> = { '26': 6, '22': 3, '28': 3, '2': 2, '15': 2 };
const BAD_CATEGORIES: Record<string, string> = {
  '10': '음악',
  '20': '게임',
  '25': '뉴스',
  '17': '스포츠',
  '1': '영화',
  '30': '영화',
};

export function classifyShopping(v: VideoItem): ShoppingVerdict {
  const reasons: Reason[] = [];
  const add = (label: string, points: number) => reasons.push({ label, points });
  const desc = v.description;
  const head = `${v.title} ${v.tags.join(' ')}`;

  // 1) 쇼핑몰 링크
  const shops = SHOPS.filter(([re]) => re.test(desc)).map(([, name]) => name);
  const uniqueShops = [...new Set(shops)];
  if (uniqueShops.length > 0) {
    add(`🔗 ${uniqueShops.join('·')} 링크`, 40 + Math.min(uniqueShops.length - 1, 2) * 5);
  } else if (LINK_HUB.test(desc)) {
    add('🔗 링크 모음 페이지', 12);
  }

  // 2) 제휴 수수료 문구, 3) 광고 표시
  if (AFFILIATE.test(desc)) add('📢 제휴 수수료 문구', 40);
  if (v.paidPromo) add('💰 유튜브 "유료 광고 포함" 표시', 30);
  else if (SPONSORED.test(`${head} ${desc}`)) add('💰 광고·협찬 문구', 20);

  // 4) 제목·태그의 쇼핑 말
  let wordPoints = 0;
  const words: string[] = [];
  for (const [re, name] of STRONG_WORDS) {
    if (re.test(head)) {
      wordPoints += 20;
      words.push(name);
    }
  }
  for (const [re, name] of WEAK_WORDS) {
    if (re.test(head)) {
      wordPoints += 8;
      words.push(name);
    }
  }
  if (words.length > 0) add(`🏷️ 제목·태그: ${words.slice(0, 4).join(', ')}`, Math.min(wordPoints, 45));

  // 5) 설명란의 구매 안내 말
  if (BUY_WORDS.test(desc)) add('🛍️ 설명란에 "구매 링크" 같은 말', 15);

  // 6) 카테고리
  const good = GOOD_CATEGORIES[v.categoryId];
  if (good) add('📂 쇼핑이 많은 분야', good);
  const bad = BAD_CATEGORIES[v.categoryId];
  if (bad) add(`🚫 ${bad} 분야`, -30);
  if (NEGATIVE.test(v.title)) add('🚫 쇼핑이 아닌 말(뮤비·게임·뉴스 등)', -20);

  const score = Math.max(0, Math.min(100, reasons.reduce((s, r) => s + r.points, 0)));
  return { score, level: levelOf(score), reasons, shops: uniqueShops };
}

export function levelOf(score: number): ShoppingLevel {
  if (score >= 50) return 'sure';
  if (score >= 30) return 'likely';
  if (score >= 15) return 'maybe';
  return 'no';
}

export const LEVEL_INFO: Record<ShoppingLevel, { label: string; color: string }> = {
  sure: { label: '쇼핑 확실', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  likely: { label: '쇼핑 같음', color: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
  maybe: { label: '애매함', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  no: { label: '쇼핑 아님', color: 'bg-white/10 text-white/50 border-white/20' },
};

/** 판별 강도에 따라 어떤 등급까지 보여줄지 */
export function passes(level: ShoppingLevel, strictness: 'strict' | 'normal' | 'loose'): boolean {
  if (level === 'sure') return true;
  if (level === 'likely') return strictness !== 'strict';
  if (level === 'maybe') return strictness === 'loose';
  return false;
}
