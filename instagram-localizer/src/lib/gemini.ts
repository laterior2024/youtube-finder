import type { GoogleGenAI, Type as SchemaType, Part, Schema } from '@google/genai';
const Type = Object.fromEntries(['OBJECT','STRING','ARRAY','INTEGER','NUMBER','BOOLEAN'].map(v => [v,v])) as Record<'OBJECT'|'STRING'|'ARRAY'|'INTEGER'|'NUMBER'|'BOOLEAN', SchemaType>;
import { authorizeRequest } from './auth';
import type {
  Align,
  AspectRatio,
  BackgroundType,
  CountryCode,
  FontStyle,
  ImageMode,
  Localization,
  PostAnalysis,
  SourceImage,
  TextBlock,
} from '../types';
import { COUNTRIES, LATIN_LANGS, defaultFontFor } from './countries';
import { fileToBase64, splitDataUrl } from './files';

export const TEXT_MODELS = [
  { id: 'gemini-flash-latest', label: 'Gemini Flash (최신, 빠르고 저렴 · 추천)' },
  { id: 'gemini-pro-latest', label: 'Gemini Pro (최신, 분석이 더 꼼꼼함 · 비쌈)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (안정 버전)' },
];

export const IMAGE_MODELS = [
  { id: 'gemini-3.1-flash-image', label: 'Nano Banana 2 · gemini-3.1-flash-image (추천)' },
  { id: 'gemini-3-pro-image', label: 'Nano Banana Pro · gemini-3-pro-image (최고 품질 · 비쌈)' },
  { id: 'gemini-2.5-flash-image', label: 'Nano Banana · gemini-2.5-flash-image (저렴)' },
];

export function createClient(apiKey: string, memberId?: string) {
  let instance: Promise<GoogleGenAI> | null = null;
  const client = () => instance ??= import('@google/genai').then(({GoogleGenAI}) => new GoogleGenAI({ apiKey, httpOptions: { timeout: 120000 } }));
  return {
    models: { generateContent: async (args: Parameters<GoogleGenAI['models']['generateContent']>[0]) => {
      if (!apiKey.trim()) throw new Error('설정에서 본인의 Gemini API 키를 등록해 주세요.');
      await authorizeRequest(memberId);
      return (await client()).models.generateContent(args);
    } },
    files: {
      upload: async (args: Parameters<GoogleGenAI['files']['upload']>[0]) => { await authorizeRequest(memberId); return (await client()).files.upload(args); },
      get: async (args: Parameters<GoogleGenAI['files']['get']>[0]) => (await client()).files.get(args),
      delete: async (args: Parameters<GoogleGenAI['files']['delete']>[0]) => (await client()).files.delete(args),
    },
  };
}

type Client = ReturnType<typeof createClient>;

/** 오류 메시지를 초보자도 이해할 수 있는 한국어로 바꿉니다. */
export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/API key not valid|API_KEY_INVALID|permission denied|PERMISSION_DENIED/i.test(raw))
    return 'API 키가 올바르지 않아요. 오른쪽 위 ⚙️ 설정에서 키를 다시 붙여넣어 주세요.';
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(raw))
    return '사용량 한도를 넘었어요. 잠시 뒤 다시 시도하거나, Google AI Studio에서 결제(Billing)를 등록해 주세요. 이미지 생성은 결제 등록이 필요해요.';
  if (/404|NOT_FOUND|not found for API version|is not supported/i.test(raw))
    return '선택한 AI 모델을 찾을 수 없어요. ⚙️ 설정에서 다른 모델을 골라 주세요.';
  if (/SAFETY|blocked|PROHIBITED/i.test(raw))
    return 'AI가 안전 정책 때문에 이 요청을 거절했어요. 프롬프트를 조금 바꿔서 다시 시도해 주세요.';
  if (/Failed to fetch|NetworkError/i.test(raw)) return '인터넷 연결을 확인해 주세요.';
  return raw.length > 300 ? raw.slice(0, 300) + '…' : raw;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 영상은 18MB 이하면 바로 보내고, 더 크면 Gemini 파일 저장소에 올린 뒤 사용합니다. */
async function videoToPart(ai: Client, file: File, onStatus: (s: string) => void, uploadedNames: string[]): Promise<Part> {
  const mimeType = file.type || 'video/mp4';
  if (file.size <= 18 * 1024 * 1024) {
    return { inlineData: { mimeType, data: await fileToBase64(file) } };
  }
  onStatus('영상이 커서 Gemini 서버에 업로드하는 중…');
  let uploaded = await ai.files.upload({ file, config: { mimeType } });
  const deadline = Date.now() + 180000;
  if (uploaded.name) uploadedNames.push(uploaded.name);
  while (String(uploaded.state) === 'PROCESSING') {
    if (Date.now() > deadline) {
      if (uploaded.name) await ai.files.delete({ name: uploaded.name }).catch(() => undefined);
      throw new Error('영상 처리 시간이 너무 길어요. 더 짧은 영상으로 시도해 주세요.');
    }
    await sleep(3000);
    uploaded = await ai.files.get({ name: uploaded.name! });
  }
  if (String(uploaded.state) === 'FAILED') throw new Error('영상 처리에 실패했어요. 다른 파일로 시도해 주세요.');
  return { fileData: { fileUri: uploaded.uri!, mimeType: uploaded.mimeType ?? mimeType } };
}

function parseJson<T>(text: string | undefined): T {
  if (!text) throw new Error('AI가 빈 응답을 보냈어요. 다시 시도해 주세요.');
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(cleaned) as T;
}

// ─────────────────────────── 1단계: 원본 분석 ───────────────────────────

const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING },
    summaryKo: { type: Type.STRING },
    whyViral: { type: Type.ARRAY, items: { type: Type.STRING } },
    hookPattern: { type: Type.STRING },
    tone: { type: Type.STRING },
    captionOriginal: { type: Type.STRING },
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER },
          purpose: { type: Type.STRING },
          backgroundType: { type: Type.STRING, enum: ['photo', 'illustration', 'solid', 'gradient'] },
          backgroundColors: { type: Type.ARRAY, items: { type: Type.STRING } },
          visualDescription: { type: Type.STRING },
          textBlocks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                role: { type: Type.STRING },
                text: { type: Type.STRING },
                box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                fontStyle: { type: Type.STRING, enum: ['sans', 'serif', 'rounded', 'handwritten', 'display'] },
                fontWeight: { type: Type.INTEGER },
                fontSize: { type: Type.INTEGER },
                lineHeight: { type: Type.NUMBER },
                color: { type: Type.STRING },
                lineColors: { type: Type.ARRAY, items: { type: Type.STRING } },
                align: { type: Type.STRING, enum: ['left', 'center', 'right'] },
                italic: { type: Type.BOOLEAN },
                uppercase: { type: Type.BOOLEAN },
                strokeColor: { type: Type.STRING },
                shadow: { type: Type.BOOLEAN },
                highlightColor: { type: Type.STRING },
              },
              required: ['role', 'text', 'box_2d', 'fontStyle', 'fontWeight', 'fontSize', 'color', 'align'],
            },
          },
        },
        required: ['index', 'purpose', 'backgroundType', 'backgroundColors', 'visualDescription', 'textBlocks'],
      },
    },
    videoSummary: { type: Type.STRING },
    videoScenes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          start: { type: Type.NUMBER },
          end: { type: Type.NUMBER },
          description: { type: Type.STRING },
          spokenText: { type: Type.STRING },
          onScreenText: { type: Type.STRING },
        },
        required: ['start', 'end', 'description', 'spokenText', 'onScreenText'],
      },
    },
  },
  required: ['topic', 'summaryKo', 'whyViral', 'hookPattern', 'tone', 'captionOriginal', 'slides'],
};

const ANALYSIS_PROMPT = `You are a world-class Instagram content strategist and graphic designer.
You are given an Instagram post: its carousel images (in order), optionally its video, and its caption. Engagement numbers are not verified. Describe potential audience appeal as hypotheses, never as proven causes of virality.
Reverse-engineer it precisely so a designer can rebuild it in another language.

For EACH image (slide), in the same order, return:
- purpose: hook / content / list-item / proof / CTA etc.
- backgroundType: "solid" (flat single color), "gradient", "photo", or "illustration".
- backgroundColors: 1–3 dominant background hex colors (e.g. "#F5E6D3").
- visualDescription: a detailed English description of the visual WITHOUT any of its text (subject, composition, camera angle, lighting, style, color palette, mood). This will be used to generate a new, original image.
- textBlocks: EVERY visible piece of text overlaid/designed on the image (ignore tiny UI/watermarks unless they are the account handle). Group lines that share the same style into one block, keep line breaks as "\\n". For each block:
  - box_2d: [ymin, xmin, ymax, xmax] tight bounding box, normalized 0–1000 relative to the image.
  - fontStyle: sans / serif / rounded / handwritten / display (display = very heavy/condensed headline fonts).
  - fontWeight: 300–900.
  - fontSize: height of ONE line of this text (cap-to-descender) on a 0–1000 scale relative to image height.
  - lineHeight: ratio between line spacing and font size (usually 1.1–1.5).
  - color: exact hex of the text fill (the main color).
  - lineColors: if different lines of this block ("\\n"-separated) use different text colors, one hex per line in order; otherwise [].
  - align, italic, uppercase.
  - strokeColor: hex if the text has an outline, else "".
  - shadow: true if there is a visible drop shadow.
  - highlightColor: hex if the text sits on a colored box/label/marker highlight, else "".
  - role: headline / subheadline / body / caption / label / cta / handle.

Also return:
- topic (English, short), tone (English, short), hookPattern (English: the formula of the hook, e.g. "Number + curiosity gap").
- summaryKo: 2–3 sentence Korean summary of what the post says.
- whyViral: 3–6 bullet points IN KOREAN explaining concretely why this post performed well (hook, save-worthiness, shareability, design, emotion…).
- captionOriginal: the caption exactly as given (or "" if none).
- If a video is provided: videoSummary (Korean) and videoScenes with start/end seconds, English visual description, spokenText (original language, verbatim) and onScreenText. Otherwise return an empty string and an empty array.
If only a video is provided (no images), return slides as an empty array.`;

interface RawBlock {
  role: string;
  text: string;
  box_2d: number[];
  fontStyle: FontStyle;
  fontWeight: number;
  fontSize: number;
  lineHeight?: number;
  color: string;
  lineColors?: string[];
  align: Align;
  italic?: boolean;
  uppercase?: boolean;
  strokeColor?: string;
  shadow?: boolean;
  highlightColor?: string;
}

interface RawAnalysis extends Omit<PostAnalysis, 'slides' | 'videoSummary' | 'videoScenes'> {
  slides: {
    index: number;
    purpose: string;
    backgroundType: BackgroundType;
    backgroundColors: string[];
    visualDescription: string;
    textBlocks: RawBlock[];
  }[];
  videoSummary?: string;
  videoScenes?: PostAnalysis['videoScenes'];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hex = (v: string | undefined, fallback = '') => (v && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim() : fallback);

function normalizeBlock(raw: RawBlock, slideIndex: number, i: number): TextBlock {
  const [ymin, xmin, ymax, xmax] = (raw.box_2d?.length === 4 ? raw.box_2d : [100, 100, 300, 900]).map((n) =>
    clamp(Number(n) || 0, 0, 1000),
  );
  const fontStyle = (['sans', 'serif', 'rounded', 'handwritten', 'display'] as FontStyle[]).includes(raw.fontStyle)
    ? raw.fontStyle
    : 'sans';
  return {
    id: `s${slideIndex}-b${i}`,
    role: raw.role || 'body',
    text: raw.text,
    originalText: raw.text,
    x: Math.min(xmin, xmax) / 10,
    y: Math.min(ymin, ymax) / 10,
    w: Math.max(4, Math.abs(xmax - xmin) / 10),
    h: Math.max(2, Math.abs(ymax - ymin) / 10),
    fontStyle,
    fontFamily: '',
    fontWeight: clamp(Math.round((raw.fontWeight || 700) / 100) * 100, 300, 900),
    fontSizePct: clamp((raw.fontSize || 50) / 10, 1, 25),
    color: hex(raw.color, '#111111'),
    lineColors: (raw.lineColors ?? []).map((c) => hex(c)).filter(Boolean).length > 1
      ? (raw.lineColors ?? []).map((c) => hex(c, hex(raw.color, '#111111')))
      : [],
    align: raw.align === 'left' || raw.align === 'right' ? raw.align : 'center',
    lineHeight: clamp(raw.lineHeight || 1.25, 0.9, 2),
    italic: !!raw.italic,
    uppercase: !!raw.uppercase,
    strokeColor: hex(raw.strokeColor),
    shadow: !!raw.shadow,
    highlightColor: hex(raw.highlightColor),
  };
}

export async function analyzePost(
  ai: Client,
  model: string,
  input: { images: SourceImage[]; video: File | null; caption: string; sourceUrl: string },
  onStatus: (s: string) => void,
): Promise<PostAnalysis> {
  const uploadedNames: string[] = [];
  try {
  const parts: Part[] = [{ text: ANALYSIS_PROMPT }];
  input.images.forEach((img, i) => {
    parts.push({ text: `Slide ${i + 1} (image ${img.width}x${img.height}):` });
    parts.push({ inlineData: splitDataUrl(img.dataUrl) });
  });
  if (input.video) {
    parts.push({ text: 'Video of the post:' });
    parts.push(await videoToPart(ai, input.video, onStatus, uploadedNames));
  }
  parts.push({ text: `Original caption:\n"""${input.caption || '(none)'}"""\nSource URL: ${input.sourceUrl || '(none)'}` });

  onStatus('AI가 원본 게시물을 분석하는 중… (글자, 폰트, 색, 배치, 떡상 이유)');
  const res = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: { responseMimeType: 'application/json', responseSchema: analysisSchema, temperature: 0.2 },
  });
  const raw = parseJson<RawAnalysis>(res.text);
  const slides = (raw.slides ?? []).slice(0, input.images.length).map((s, si) => ({
    index: si,
    purpose: s.purpose,
    backgroundType: s.backgroundType,
    backgroundColors: (s.backgroundColors ?? []).map((c) => hex(c)).filter(Boolean),
    visualDescription: s.visualDescription,
    textBlocks: (s.textBlocks ?? []).map((b, bi) => normalizeBlock(b, si, bi)),
  }));
  return {
    topic: raw.topic,
    summaryKo: raw.summaryKo,
    whyViral: raw.whyViral ?? [],
    hookPattern: raw.hookPattern,
    tone: raw.tone,
    captionOriginal: raw.captionOriginal ?? input.caption,
    slides,
    videoSummary: raw.videoSummary ?? '',
    videoScenes: raw.videoScenes ?? [],
  };
  } finally {
    await Promise.allSettled(uploadedNames.map(name => ai.files.delete({ name })));
  }
}

// ─────────────────────────── 2단계: 현지화 ───────────────────────────

const localizationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER },
          texts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { id: { type: Type.STRING }, text: { type: Type.STRING } },
              required: ['id', 'text'],
            },
          },
          imagePrompt: { type: Type.STRING },
        },
        required: ['index', 'texts', 'imagePrompt'],
      },
    },
    hookAlternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
    postingTip: { type: Type.STRING },
    culturalNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
    videoSubtitles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { start: { type: Type.NUMBER }, end: { type: Type.NUMBER }, text: { type: Type.STRING } },
        required: ['start', 'end', 'text'],
      },
    },
    videoScenePrompts: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['slides', 'hookAlternatives', 'postingTip', 'culturalNotes'],
};

const CAPTION_KEYS = [
  'caption',
  'hashtags',
  'hashtagReasons',
  'captionCheck',
  'ctaComment',
  'ctaShare',
  'ctaCommentOptions',
  'ctaShareOptions',
  'creditLine',
  'seoKeywords',
  'commentKeyword',
  'altTexts',
] as const;
export type SlideLocalization = Omit<Localization, (typeof CAPTION_KEYS)[number]>;
export type CaptionResult = Pick<Localization, (typeof CAPTION_KEYS)[number]>;

export async function localizePost(
  ai: Client,
  model: string,
  analysis: PostAnalysis,
  country: CountryCode,
): Promise<SlideLocalization> {
  const info = COUNTRIES[country];
  const compact = {
    topic: analysis.topic,
    tone: analysis.tone,
    hookPattern: analysis.hookPattern,
    slides: analysis.slides.map((s) => ({
      index: s.index,
      purpose: s.purpose,
      visualDescription: s.visualDescription,
      texts: s.textBlocks.map((b) => ({
        id: b.id,
        role: b.role,
        text: b.originalText,
        maxCharsHint: Math.max(4, Math.round(b.originalText.length * info.lengthFactor)),
      })),
    })),
    videoScenes: analysis.videoScenes,
  };

  const prompt = `You are a top ${info.language} Instagram creator and localization expert.
Adapt this post for audiences in ${info.nameEn} (${info.language}) while preserving its factual meaning. Do not promise engagement results.

Audience & style: ${info.audience}

Rules:
1. Transcreate, don't translate: keep the meaning, the hook formula ("${analysis.hookPattern}") and the emotional punch, but phrase it the way a native creator would. Replace foreign-only references with local equivalents when it helps.
2. Each text must fit the same design box: stay close to maxCharsHint, keep the same number of line breaks ("\\n") roughly, and keep headlines short and punchy.
3. Return EVERY text id exactly as given. Keep account handles unchanged.
4. imagePrompt (English): a detailed prompt for an ORIGINAL image that conveys the same meaning as visualDescription but adapted to ${info.nameEn} (people, setting, objects, food, signage style should feel local). Describe subject, composition, lighting, style and color palette. It must NOT ask for any text or letters.
5. hookAlternatives: 5 alternative first-slide hooks in ${info.language}, same length as the original headline.
6. postingTip: IN KOREAN — best days/times to post for ${info.nameEn} (local time) and one tip for this topic.
7. culturalNotes: IN KOREAN — 2–5 notes about what you changed for the local audience and why.
8. If videoScenes exist: videoSubtitles = translated subtitles (same timings, split long lines), and videoScenePrompts = one English text-to-video prompt per scene adapted to ${info.nameEn}. Otherwise return empty arrays.

Post data:
${JSON.stringify(compact, null, 2)}`;

  const res = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { responseMimeType: 'application/json', responseSchema: localizationSchema, temperature: 0.7 },
  });
  const raw = parseJson<Omit<SlideLocalization, 'country'>>(res.text);
  return {
    country,
    hookAlternatives: (raw.hookAlternatives ?? []).filter((h) => !looksRepetitive(h)),
    postingTip: raw.postingTip ?? '',
    culturalNotes: raw.culturalNotes ?? [],
    slides: (raw.slides ?? []).map((sl) => ({ ...sl, texts: sl.texts.map((t) => ({ ...t, text: collapseRepeats(t.text) })) })),
    videoSubtitles: raw.videoSubtitles ?? [],
    videoScenePrompts: raw.videoScenePrompts ?? [],
  };
}

/** 분석 결과 + 현지화 결과를 합쳐, 편집 가능한 글자 블록으로 만듭니다. */
export function localizedBlocks(blocks: TextBlock[], texts: { id: string; text: string }[], country: CountryCode) {
  const lang = COUNTRIES[country].lang;
  return blocks.map((b) => {
    const found = texts.find((t) => t.id === b.id);
    return {
      ...b,
      text: found?.text ?? b.originalText,
      fontFamily: defaultFontFor(lang, b.fontStyle),
      uppercase: LATIN_LANGS.includes(lang) ? b.uppercase : false,
      italic: LATIN_LANGS.includes(lang) ? b.italic : false,
    };
  });
}

// ─────────────────────────── 2-2단계: 설명글(캡션) 재작성 ───────────────────────────

const captionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    captionCheck: { type: Type.ARRAY, items: { type: Type.STRING } },
    caption: { type: Type.STRING },
    seoKeywords: { type: Type.ARRAY, items: { type: Type.STRING }, maxItems: '4' },
    hashtags: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: '3', maxItems: '5' },
    hashtagReasons: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: '3', maxItems: '5' },
    commentKeyword: { type: Type.STRING },
    altTexts: { type: Type.ARRAY, items: { type: Type.STRING } },
    ctaComment: { type: Type.STRING },
    ctaShare: { type: Type.STRING },
    ctaCommentOptions: { type: Type.ARRAY, items: { type: Type.STRING } },
    ctaShareOptions: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'captionCheck',
    'caption',
    'hashtags',
    'hashtagReasons',
    'ctaComment',
    'ctaShare',
    'ctaCommentOptions',
    'ctaShareOptions',
    'seoKeywords',
    'commentKeyword',
    'altTexts',
  ],
};

/** 해시태그 개수: 카테고리 분류용으로 3~5개 (인스타 권장) */
export const HASHTAG_MIN = 3;
export const HASHTAG_MAX = 5;

/**
 * AI가 가끔 같은 말을 끝없이 반복하는 오류(예: "이슈이슈이슈…")에 빠질 때가 있어요.
 * 2글자 이상 덩어리가 연달아 minRepeats번 이상 반복되면 이상한 글로 봐요.
 * (ㅋㅋㅋㅋ, ㅠㅠㅠ, !!! 처럼 한 글자만 반복되는 건 괜찮아요.)
 */
export function looksRepetitive(text: string, minRepeats = 5): boolean {
  const re = new RegExp(`([\\s\\S]{2,15}?)\\1{${minRepeats - 1},}`, 'gu');
  for (const m of text.matchAll(re)) {
    if (new Set(Array.from(m[1].trim())).size > 1) return true;
  }
  return false;
}

/** 반복 오류가 섞여 있으면 반복된 부분을 한 번만 남기고 줄여요 (마지막 안전장치). */
export function collapseRepeats(text: string): string {
  return text.replace(/([\s\S]{2,15}?)\1{4,}/gu, (all, chunk: string) =>
    new Set(Array.from(chunk.trim())).size > 1 ? chunk : all,
  );
}

const MAX_HASHTAG_LENGTH = 30;

/** 해시태그 하나가 쓸 만한지: 너무 길거나, 같은 말이 반복되거나, 이상한 기호가 있으면 버려요. */
function isValidHashtag(tag: string): boolean {
  const body = tag.replace(/^#/, '');
  return (
    body.length >= 1 &&
    Array.from(body).length <= MAX_HASHTAG_LENGTH &&
    !looksRepetitive(body, 2) &&
    /^[\p{L}\p{N}_]+$/u.test(body)
  );
}

/**
 * 해시태그를 "#단어" 형태로 정리해요.
 * - 한 칸에 태그 여러 개가 붙어 오면(예: "#감동 #감동글") 하나씩 나눠요.
 * - (strict일 때) 너무 길거나 반복된 이상한 태그는 버려요.
 * - 중복을 없앤 뒤 최대 5개만 남겨요.
 */
export function cleanHashtags(tags: string[], { strict = true } = {}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    for (const m of raw.matchAll(/#?([^\s#,，、]+)/gu)) {
      const tag = `#${m[1]}`;
      const key = tag.toLowerCase();
      // strict: AI가 만든 태그 검사용. 사용자가 직접 고친 태그는 나누기·중복 제거만 해요.
      if ((strict && !isValidHashtag(tag)) || seen.has(key)) continue;
      seen.add(key);
      out.push(tag);
    }
  }
  return out.slice(0, HASHTAG_MAX);
}

/** 슬라이드별 대체 텍스트를 붙여넣기 쉬운 글로 묶어요 (ZIP의 alt_text.txt). */
export function altTextFile(loc: Pick<Localization, 'altTexts'>): string {
  return loc.altTexts.map((a, i) => `${i + 1}장: ${a}`).join('\n');
}

/**
 * 인스타에 그대로 붙여넣을 최종 설명글:
 * 본문(① 첫 줄 훅 ② 번호 본문 ③ 📌 저장 요약) → ④ ✈️ DM 공유 → ⑤ 💬 댓글 → 출처 → 해시태그 3~5개
 */
export function finalCaption(
  loc: Pick<Localization, 'caption' | 'hashtags' | 'ctaComment' | 'ctaShare' | 'creditLine'>,
): string {
  const tags = loc.hashtags.filter(Boolean).join(' ');
  return [loc.caption.trim(), loc.ctaShare.trim(), loc.ctaComment.trim(), loc.creditLine.trim(), tags].filter(Boolean).join('\n\n');
}

/**
 * 원본 설명글의 취지·내용은 그대로 두고, 표현만 완전히 새로 써서 현지화합니다.
 * (번역투 직역 = 원문 문장 복제에 가까우므로 피하고, 없는 내용을 지어내지도 않습니다.)
 */
export function captionSource(analysis: PostAnalysis): string {
  return [
    analysis.captionOriginal.trim() ? 'ORIGINAL CAPTION:\n' + analysis.captionOriginal : '',
    ...analysis.slides.map(s => 'Slide ' + (s.index + 1) + ': ' + s.textBlocks.map(b => b.originalText).join(' / ')),
    analysis.videoSummary ? 'VIDEO SUMMARY:\n' + analysis.videoSummary : '',
    ...analysis.videoScenes.map(s => 'Video ' + s.start + '-' + s.end + 's: ' + [s.spokenText, s.onScreenText, s.description].filter(Boolean).join(' / ')),
  ].filter(Boolean).join('\n\n') || 'No source facts available. Do not invent facts.';
}

export async function writeCaption(
  ai: Client,
  model: string,
  analysis: PostAnalysis,
  country: CountryCode,
  credit: string,
  { dmOffer = '', previousCaption = '' }: { dmOffer?: string; previousCaption?: string } = {},
): Promise<CaptionResult> {
  const info = COUNTRIES[country];
  const slideCount = Math.max(1, analysis.slides.length);
  const offer = dmOffer.trim();
  const source = captionSource(analysis);

  const prompt = `You are an expert ${info.language} Instagram copywriter.
Write a NEW ${info.language} Instagram caption for audiences in ${info.nameEn}, based on the source below.
Post topic: ${analysis.topic}. Tone: ${analysis.tone}.
Audience & style: ${info.audience}

Both goals are mandatory:

A) FAITHFUL TO THE ORIGINAL — same message, nothing invented.
- Keep every key point, fact, number, step, tip and the author's intent/opinion.
- Do NOT add anything that is not in the source: no new facts, statistics, examples, anecdotes, personal stories, claims, promises, products, prices or advice.
- Do NOT drop key points. If the source is vague, stay vague.
- Allowed: converting units/currency to local ones with an equivalent value, and replacing a foreign-only reference with a local one ONLY if it means exactly the same thing.

B) ORIGINAL WORDING — a re-expression, not a translation.
- Do not translate sentence by sentence. Re-express the content in your own words: restructure sentences, merge or split them, reorder within a paragraph where natural, use different vocabulary.
- No sentence may be a literal translation of a source sentence. Never reproduce distinctive phrases, slogans or jokes word for word — convey the same meaning differently.
- It must read as if a native ${info.language} creator wrote it from scratch.

CAPTION STRUCTURE — Instagram's current ranking rewards dwell time, saves and above all DM shares ("sends"), and its AI reads the caption text itself (more than hashtags) to decide which interest category to recommend the post in. Build "caption" from these zones, in this order, separated by blank lines:
ZONE 1 — HOOK + SEO (the first line, the only line visible before "more"): naturally include the main topic keyword(s) people would search for in ${info.language}, and stop the scroll with a curiosity/empathy question or the key conclusion from the source. One sentence.
ZONE 2 — BODY FOR DWELL TIME: organize the source's key story/points as a short numbered list ("1. … 2. … 3. …", 2–5 items — as many as the source really has) or as a problem → solution flow. Concise and scannable, one point per line. Only information from the source.
ZONE 3 — SAVE TRIGGER: a compact block whose first line starts with "📌" + a short title such as "[topic] at a glance" + a brief "save it for later" phrase (all in ${info.language}), followed by 2–3 bullet lines starting with "• " that summarize the most useful takeaways. Only information from the source (shorter restatements are fine).
Zones 4 and 5 are the separate CTA fields below — do NOT write them inside "caption". No credit/source line and no hashtags inside "caption" either (added automatically).
Emojis: only the structural ones above (📌, bullets), plus others only if the source uses them. Keep the whole caption under ~1,500 characters.

seoKeywords: the 2–4 main search keywords (in ${info.language}) you used in the hook — the words people in ${info.nameEn} would type to find this topic.

HASHTAGS — 3 to 5 (4 is ideal), used by Instagram for category classification and discovery in ${info.nameEn}:
mix a broad high-volume topic tag, a mid-size community tag, and specific niche tag(s) that closely match THIS post.
Each hashtag is ONE short tag (at most 20 characters), no spaces, one tag per array item — never put several tags or sentences in one item, and never repeat a word inside a tag.
They must be real, commonly used in ${info.nameEn} (written in ${info.language} unless the English tag is what locals actually use), relevant to the content, each starting with #.
Never use generic engagement or spammy tags (#follow, #like4like, #instagood, #fyp, #viral, etc.) or banned tags.
hashtagReasons: IN KOREAN, one short reason per hashtag, same order.

CALL TO ACTION — separate fields, written in ${info.language}, NOT inside "caption".
- ZONE 4 — ctaShare (DM share, the strongest ranking signal): ONE line starting with "✈️" that names a SPECIFIC person or situation the reader will immediately think of, tied to this content (e.g. "✈️ If a friend who … comes to mind, send this to them by DM right now!"). Never a vague "please share".
${
  offer
    ? `- ZONE 5 — ctaComment (comment → DM automation): ONE line starting with "💬" asking people to comment ONE short keyword to receive "${offer}" by DM (e.g. "💬 Comment 'GUIDE' and I'll DM you ${offer} right away!"). Choose an easy keyword in ${info.language} (1–2 words) related to the topic, wrap it in quotes in the line, and return it in commentKeyword. Promise exactly "${offer}" — nothing more.`
    : `- ZONE 5 — ctaComment: ONE line starting with "💬" with an easy, specific question tied to THIS post's content that anyone can answer in a few words, a number or an emoji (pick A or B, which point is theirs, their own experience). commentKeyword = "".`
}
- ctaShareOptions: 3 more, clearly different DM-share CTAs (each starting with "✈️", each naming a different specific person/situation). ctaCommentOptions: 3 more, clearly different comment CTAs (each starting with "💬", same rules${offer ? ', same keyword offer' : ''}).
- Each line short (under ~${info.ctaMaxChars} characters), natural for a native ${info.language} creator.
- No engagement bait that Instagram demotes: no "like if…", "comment YES/1" without a real offer, "tag 5 friends", "follow for more", fake urgency or giveaways. CTAs must not add any new facts.

ALT TEXT — altTexts: exactly ${slideCount} item(s), one per slide in order, in ${info.language}, for Instagram's "Alt text" field (Advanced settings → Accessibility). Each is one descriptive sentence (under ~120 characters) saying what the slide shows and its message, naturally including a main keyword — e.g. "A card-news image summarizing … for …". Describe the new localized post, not the original account.

captionCheck: IN KOREAN. First list each key point of the source and how your caption expresses it, as "원문: … → 새 글: …(한국어 뜻)". This lets the user verify nothing was added or dropped. Write captionCheck BEFORE writing the caption.
${previousCaption ? `\nA previous version was:\n"""${previousCaption}"""\nWrite a clearly DIFFERENT wording from it, with the same content.` : ''}

${source}`;

  const creditLine = credit ? `${info.creditLabel}: ${credit}` : '';
  const one = (t: string | undefined) => (t ?? '').replace(/\s*\n+\s*/g, ' ').trim();

  const generate = async (temperature: number): Promise<{ result: CaptionResult; brokenTags: boolean }> => {
    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      // maxOutputTokens: AI가 반복 오류에 빠져도 끝없이 길어지지 않게 막아요.
      config: { responseMimeType: 'application/json', responseSchema: captionSchema, temperature, maxOutputTokens: 16384 },
    });
    const raw = parseJson<Omit<CaptionResult, 'creditLine'>>(res.text);
    // 모델이 본문 안에 해시태그·출처 줄을 넣었으면 떼어 냅니다 (둘 다 따로 맨 끝에 붙어요).
    const body = (raw.caption ?? '')
      .split('\n')
      .filter((line) => !/^\s*(#[^\s#]+\s*)+$/.test(line) && !line.trim().startsWith(`${info.creditLabel}:`))
      .join('\n')
      .trim();
    // 해시태그와 이유를 짝지어 두고, 쓸 만한 태그만 남겨요.
    const tagPairs = (raw.hashtags ?? []).map((t, i) => ({ tags: cleanHashtags([t]), reason: raw.hashtagReasons?.[i] ?? '' }));
    const hashtags = cleanHashtags(tagPairs.flatMap((p) => p.tags));
    const hashtagReasons = hashtags.map((t) => tagPairs.find((p) => p.tags.includes(t))?.reason ?? '');
    // AI가 해시태그를 쓰다 반복 오류에 빠졌는지 (한 칸이 비정상적으로 길거나 같은 말이 반복됨)
    const brokenTags = (raw.hashtags ?? []).some((t) => t.length > 60 || looksRepetitive(t, 3));
    const altTexts = (raw.altTexts ?? []).map(one).filter((a) => !looksRepetitive(a));
    const result: CaptionResult = {
      caption: body,
      seoKeywords: (raw.seoKeywords ?? []).map(one).filter((k) => k && k.length <= 40 && !looksRepetitive(k)).slice(0, 4),
      commentKeyword: offer ? one(raw.commentKeyword).slice(0, 30) : '',
      altTexts: Array.from({ length: slideCount }, (_, i) => altTexts[i] ?? ''),
      ctaComment: one(raw.ctaComment),
      ctaShare: one(raw.ctaShare),
      ctaCommentOptions: (raw.ctaCommentOptions ?? []).map(one).filter((o) => o && !looksRepetitive(o)).slice(0, 3),
      ctaShareOptions: (raw.ctaShareOptions ?? []).map(one).filter((o) => o && !looksRepetitive(o)).slice(0, 3),
      creditLine,
      hashtags,
      hashtagReasons,
      captionCheck: (raw.captionCheck ?? []).filter((c) => !looksRepetitive(c)),
    };
    return { result, brokenTags };
  };

  /** 반복 오류가 있거나, 해시태그가 3개가 안 되면 문제 있는 결과로 봐요. */
  const problems = ({ result: r, brokenTags }: { result: CaptionResult; brokenTags: boolean }) =>
    brokenTags ||
    looksRepetitive(r.caption) ||
    looksRepetitive(r.ctaComment) ||
    looksRepetitive(r.ctaShare) ||
    r.hashtags.length < HASHTAG_MIN ||
    !r.caption.trim();
  type Attempt = Awaited<ReturnType<typeof generate>>;

  const firstTemp = previousCaption ? 0.9 : 0.7;
  let attempt: Attempt | null = null;
  try {
    attempt = await generate(firstTemp);
  } catch {
    // 응답이 중간에 잘리는 등 읽을 수 없으면 아래에서 한 번 더 시도해요.
  }
  if (!attempt || problems(attempt)) {
    // 한 번 더, 조금 다른 온도로 다시 써요. 그래도 문제가 남으면 쓸 수 있는 부분만 살려요.
    const retry = await generate(firstTemp > 0.6 ? 0.5 : 0.8).catch(() => null);
    if (retry && (!attempt || !problems(retry) || retry.result.hashtags.length > attempt.result.hashtags.length)) attempt = retry;
  }
  const result = attempt?.result;
  if (!result) throw new Error('설명글을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  return {
    ...result,
    caption: collapseRepeats(result.caption),
    ctaComment: collapseRepeats(result.ctaComment),
    ctaShare: collapseRepeats(result.ctaShare),
  };
}

// ─────────────────────────── 저작권 안전 점검 (AI) ───────────────────────────

export interface OriginalityImageCheck {
  index: number;
  /** 0~100: 100이면 사실상 같은 사진 */
  similarity: number;
  sameIdentifiablePerson: boolean;
  watermarkOrLogo: boolean;
  /** 원본에서 그대로 가져온 것처럼 보이는 요소 (한국어) */
  copiedElements: string[];
}

export interface OriginalityCheck {
  /** 0~100: 100이면 원문을 문장마다 그대로 번역한 수준 */
  captionTranslationCloseness: number;
  captionCopiedPhrases: string[];
  slideTextCloseness: number;
  images: OriginalityImageCheck[];
  /** 더 안전하게 만들기 위한 조언 (한국어) */
  tipsKo: string[];
}

const originalitySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    captionTranslationCloseness: { type: Type.INTEGER },
    captionCopiedPhrases: { type: Type.ARRAY, items: { type: Type.STRING }, maxItems: '5' },
    slideTextCloseness: { type: Type.INTEGER },
    images: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER },
          similarity: { type: Type.INTEGER },
          sameIdentifiablePerson: { type: Type.BOOLEAN },
          watermarkOrLogo: { type: Type.BOOLEAN },
          copiedElements: { type: Type.ARRAY, items: { type: Type.STRING }, maxItems: '5' },
        },
        required: ['index', 'similarity', 'sameIdentifiablePerson', 'watermarkOrLogo', 'copiedElements'],
      },
    },
    tipsKo: { type: Type.ARRAY, items: { type: Type.STRING }, maxItems: '4' },
  },
  required: ['captionTranslationCloseness', 'captionCopiedPhrases', 'slideTextCloseness', 'images', 'tipsKo'],
};

/**
 * 원본과 새 결과물을 나란히 보여 주고 "얼마나 가까운지" AI에게 평가받아요.
 * 법적 판단이 아니라, 직역·복제에 가까운 부분을 찾아내는 참고용 점검이에요.
 */
export async function checkOriginality(
  ai: Client,
  model: string,
  input: {
    originalCaption: string;
    newCaption: string;
    originalSlideTexts: string[];
    newSlideTexts: string[];
    imagePairs: { index: number; original: string; generated: string }[];
  },
): Promise<OriginalityCheck> {
  const parts: Part[] = [
    {
      text: `You are a careful content-originality reviewer. Compare an ORIGINAL Instagram post with a NEW localized version (possibly in another language).
Estimate how close the new material is to the original's EXPRESSION (not its ideas or facts — reusing facts, topics and general layout ideas is fine).

Return:
- captionTranslationCloseness (0–100): 100 = the new caption is a sentence-by-sentence (near-literal) translation or copy of the original caption; 50 = partly re-expressed; 0 = the same information fully re-expressed in new sentences. If the original caption is empty, return 0.
- captionCopiedPhrases: up to 5 distinctive phrases/sentences from the NEW caption that are literal translations or copies of distinctive original wording (quote them as they appear in the new caption). Empty if none.
- slideTextCloseness (0–100): same idea for the text on the slides.
- images: for each image pair (ORIGINAL then NEW, same index), similarity 0–100 where 100 = same photo/artwork (or a trivially edited copy), 60 = same scene recreated closely, 30 = similar theme and mood but different image, 0 = unrelated. Also flag sameIdentifiablePerson (the same real, recognizable person appears in both), watermarkOrLogo (the NEW image contains a watermark, logo or account handle), and copiedElements (in KOREAN, short) for distinctive elements copied from the original.
- tipsKo: up to 4 short, practical tips IN KOREAN to make the new version more original (empty if it already looks fine).

ORIGINAL CAPTION:
"""${input.originalCaption || '(none)'}"""

NEW CAPTION:
"""${input.newCaption}"""

ORIGINAL SLIDE TEXT:
${input.originalSlideTexts.map((t, i) => `${i + 1}. ${t}`).join('\n') || '(none)'}

NEW SLIDE TEXT:
${input.newSlideTexts.map((t, i) => `${i + 1}. ${t}`).join('\n') || '(none)'}`,
    },
  ];
  for (const pair of input.imagePairs) {
    parts.push({ text: `Image pair ${pair.index + 1} — ORIGINAL:` });
    parts.push({ inlineData: splitDataUrl(pair.original) });
    parts.push({ text: `Image pair ${pair.index + 1} — NEW:` });
    parts.push({ inlineData: splitDataUrl(pair.generated) });
  }

  const res = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: { responseMimeType: 'application/json', responseSchema: originalitySchema, temperature: 0.1, maxOutputTokens: 8192 },
  });
  const raw = parseJson<OriginalityCheck>(res.text);
  const pct = (v: unknown) => Math.round(clamp(Number(v) || 0, 0, 100));
  return {
    captionTranslationCloseness: pct(raw.captionTranslationCloseness),
    captionCopiedPhrases: (raw.captionCopiedPhrases ?? []).filter((p) => p && !looksRepetitive(p)).slice(0, 5),
    slideTextCloseness: pct(raw.slideTextCloseness),
    images: (raw.images ?? []).map((im) => ({
      index: Math.max(0, (Number(im.index) || 1) - 1),
      similarity: pct(im.similarity),
      sameIdentifiablePerson: !!im.sameIdentifiablePerson,
      watermarkOrLogo: !!im.watermarkOrLogo,
      copiedElements: (im.copiedElements ?? []).filter(Boolean).slice(0, 5),
    })),
    tipsKo: (raw.tipsKo ?? []).filter((t) => t && !looksRepetitive(t)).slice(0, 4),
  };
}

// ─────────────────────────── 3단계: 이미지 생성 ───────────────────────────

function describeRegion(b: TextBlock): string {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const v = cy < 33 ? 'top' : cy > 66 ? 'bottom' : 'middle';
  const h = cx < 33 ? 'left' : cx > 66 ? 'right' : 'center';
  return `${v}-${h} (about ${Math.round(b.y)}–${Math.round(b.y + b.h)}% from the top)`;
}

export async function generateBackground(
  ai: Client,
  model: string,
  opts: {
    mode: ImageMode;
    prompt: string;
    reference: string | null;
    aspect: AspectRatio;
    textBlocks: TextBlock[];
  },
): Promise<string> {
  const parts: Part[] = [];
  if (opts.reference) parts.push({ inlineData: splitDataUrl(opts.reference) });

  const clearAreas = opts.textBlocks.map(describeRegion);
  const instruction =
    opts.mode === 'cleanup' && opts.reference
      ? `Remove ALL text, letters, numbers, captions, stickers with text, watermarks and logos from this image and naturally reconstruct what is behind them. Keep everything else (subject, composition, colors, lighting) exactly the same. Output only the cleaned image.`
      : `${opts.prompt}

${opts.reference ? 'The attached image is ONLY a reference for composition, color palette, lighting and mood. Create a NEW, ORIGINAL image — do not copy the reference, change the people, objects and details.' : ''}
STRICT RULES: absolutely no text, letters, numbers, captions, logos, watermarks, signs with writing, or UI elements anywhere in the image.
${clearAreas.length ? `Text will be overlaid later at: ${clearAreas.join('; ')}. Keep those areas calm and low-detail (no faces or important objects there) so overlaid text stays readable.` : ''}
High quality, Instagram-ready, professional.`;
  parts.push({ text: instruction });

  const res = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: opts.aspect } },
  });
  const outParts = res.candidates?.[0]?.content?.parts ?? [];
  const img = outParts.find((p) => p.inlineData?.data);
  if (!img?.inlineData?.data) {
    const reason = outParts.map((p) => p.text).filter(Boolean).join(' ') || res.candidates?.[0]?.finishReason || '';
    throw new Error(`이미지가 생성되지 않았어요. ${reason}`.trim());
  }
  return `data:${img.inlineData.mimeType ?? 'image/png'};base64,${img.inlineData.data}`;
}
