import { loadImage } from './files';

/**
 * 원본과 새로 만든 결과물이 "얼마나 비슷한지"를 숫자(0~100%)로 재는 도구예요.
 * 모두 내 브라우저 안에서 계산해서 무료예요.
 *
 * ⚠️ 이 숫자는 참고용 지표예요. 저작권 침해 여부를 법적으로 판단하는 도구가 아니에요.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 사진을 작은 크기로 줄여서 픽셀 값을 읽어요. */
async function pixels(src: string, w: number, h: number): Promise<Uint8ClampedArray> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  // 비율이 달라도 가운데를 기준으로 꽉 채워서 비교해요.
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return ctx.getImageData(0, 0, w, h).data;
}

function gray(data: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(data.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  return out;
}

/** ① 지각 해시(dHash): 밝고 어두운 흐름이 같은지. 우연히 비슷한 정도(절반)는 0%로 봐요. */
async function hashSimilarity(a: string, b: string): Promise<number> {
  const bits = async (src: string) => {
    const g = gray(await pixels(src, 9, 8));
    const out: boolean[] = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out.push(g[y * 9 + x] > g[y * 9 + x + 1]);
    return out;
  };
  const [ba, bb] = await Promise.all([bits(a), bits(b)]);
  const hamming = ba.reduce((n, v, i) => n + (v !== bb[i] ? 1 : 0), 0);
  return clamp01(1 - hamming / 32);
}

/** ② 구도(윤곽선) 비교: 사물의 모양과 위치가 겹치는지. 관계없는 사진은 0% 근처예요. */
async function structureSimilarity(a: string, b: string): Promise<number> {
  const size = 48;
  const edges = async (src: string) => {
    const g = gray(await pixels(src, size, size));
    const e = new Float32Array(size * size);
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = y * size + x;
        const gx = g[i + 1] - g[i - 1];
        const gy = g[i + size] - g[i - size];
        e[i] = Math.hypot(gx, gy);
      }
    }
    return e;
  };
  const [ea, eb] = await Promise.all([edges(a), edges(b)]);
  const mean = (v: Float32Array) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = mean(ea);
  const mb = mean(eb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ea.length; i++) {
    num += (ea[i] - ma) * (eb[i] - mb);
    da += (ea[i] - ma) ** 2;
    db += (eb[i] - mb) ** 2;
  }
  if (!da || !db) return 0;
  return clamp01(num / Math.sqrt(da * db));
}

/** ③ 색 분포 비교: 쓰인 색의 비율이 비슷한지. */
async function colorSimilarity(a: string, b: string): Promise<number> {
  const hist = async (src: string) => {
    const d = await pixels(src, 64, 64);
    const h = new Float32Array(64);
    for (let i = 0; i < d.length; i += 4) h[(d[i] >> 6) * 16 + (d[i + 1] >> 6) * 4 + (d[i + 2] >> 6)]++;
    const total = d.length / 4;
    return h.map((v) => v / total);
  };
  const [ha, hb] = await Promise.all([hist(a), hist(b)]);
  let inter = 0;
  for (let i = 0; i < ha.length; i++) inter += Math.min(ha[i], hb[i]);
  return clamp01(inter);
}

export interface ImageSimilarity {
  /** 종합 유사도 0~100 */
  total: number;
  structure: number;
  hash: number;
  color: number;
}

/** 두 사진이 얼마나 비슷한지 (구도 45% + 밝기 흐름 35% + 색 20%) */
export async function compareImages(original: string, generated: string): Promise<ImageSimilarity> {
  const [structure, hash, color] = await Promise.all([
    structureSimilarity(original, generated),
    hashSimilarity(original, generated),
    colorSimilarity(original, generated),
  ]);
  const total = 0.45 * structure + 0.35 * hash + 0.2 * color;
  const pct = (v: number) => Math.round(v * 100);
  return { total: pct(total), structure: pct(structure), hash: pct(hash), color: pct(color) };
}

// ─────────────────────────── 글자 비교 ───────────────────────────

/** 기호·이모지·띄어쓰기를 빼고 글자만 남겨요. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/#[^\s#]+/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function ngrams(text: string, n: number): Set<string> {
  const chars = Array.from(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= chars.length; i++) out.add(chars.slice(i, i + n).join(''));
  return out;
}

export interface TextOverlap {
  /** 새 글 중 원문과 글자 그대로 겹치는 비율 0~100 (같은 언어일 때 의미가 커요) */
  overlap: number;
  /** 원문과 똑같이 이어지는 가장 긴 부분 (15글자 이상일 때만) */
  longestCopied: string;
}

/** 원문 글자가 새 글에 "그대로" 들어간 정도를 재요. 언어가 다르면 거의 0%가 나와요. */
export function compareTexts(original: string, generated: string): TextOverlap {
  const a = normalize(original);
  const b = normalize(generated);
  if (!a || !b) return { overlap: 0, longestCopied: '' };
  const ga = ngrams(a, 5);
  const gb = ngrams(b, 5);
  let shared = 0;
  gb.forEach((g) => {
    if (ga.has(g)) shared++;
  });
  const overlap = gb.size ? Math.round((shared / gb.size) * 100) : 0;
  return { overlap, longestCopied: longestCommonRun(original, generated) };
}

/** 원문과 새 글에 똑같이 들어 있는 가장 긴 구간 (띄어쓰기 포함, 15글자 이상만) */
function longestCommonRun(original: string, generated: string): string {
  const a = Array.from(original.toLowerCase().slice(0, 3000));
  const b = Array.from(generated.toLowerCase().slice(0, 3000));
  let best = 0;
  let end = 0;
  let prev = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Uint16Array(b.length + 1);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) {
          best = cur[j];
          end = j;
        }
      }
    }
    prev = cur;
  }
  const run = b.slice(end - best, end).join('').trim();
  return Array.from(normalize(run)).length >= 15 ? run : '';
}

// ─────────────────────────── 판정 ───────────────────────────

export type Verdict = 'safe' | 'caution' | 'risk';

/** 유사도(%)가 낮을수록 안전해요. */
export function verdictFromSimilarity(similarity: number): Verdict {
  if (similarity <= 35) return 'safe';
  if (similarity <= 60) return 'caution';
  return 'risk';
}

export const VERDICT_LABEL: Record<Verdict, { icon: string; text: string; cls: string }> = {
  safe: { icon: '✅', text: '안전', cls: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30' },
  caution: { icon: '⚠️', text: '주의', cls: 'bg-amber-500/15 text-amber-200 ring-amber-400/30' },
  risk: { icon: '❌', text: '위험', cls: 'bg-red-500/15 text-red-200 ring-red-400/30' },
};
