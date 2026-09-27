import { GoogleGenAI, Type, type Part, type Schema } from '@google/genai';
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
import { COUNTRIES, defaultFontFor } from './countries';
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

export function createClient(apiKey: string) {
  return new GoogleGenAI({ apiKey });
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
async function videoToPart(ai: Client, file: File, onStatus: (s: string) => void): Promise<Part> {
  const mimeType = file.type || 'video/mp4';
  if (file.size <= 18 * 1024 * 1024) {
    return { inlineData: { mimeType, data: await fileToBase64(file) } };
  }
  onStatus('영상이 커서 Gemini 서버에 업로드하는 중…');
  let uploaded = await ai.files.upload({ file, config: { mimeType } });
  while (String(uploaded.state) === 'PROCESSING') {
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
You are given an Instagram post that went viral (10k+ likes): its carousel images (in order), optionally its video, and its caption.
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
  - color: exact hex of the text fill.
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
  const parts: Part[] = [{ text: ANALYSIS_PROMPT }];
  input.images.forEach((img, i) => {
    parts.push({ text: `Slide ${i + 1} (image ${img.width}x${img.height}):` });
    parts.push({ inlineData: splitDataUrl(img.dataUrl) });
  });
  if (input.video) {
    parts.push({ text: 'Video of the post:' });
    parts.push(await videoToPart(ai, input.video, onStatus));
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
    caption: { type: Type.STRING },
    hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
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
  required: ['slides', 'caption', 'hashtags', 'hookAlternatives', 'postingTip', 'culturalNotes'],
};

export async function localizePost(
  ai: Client,
  model: string,
  analysis: PostAnalysis,
  country: CountryCode,
  credit: string,
): Promise<Localization> {
  const info = COUNTRIES[country];
  const compact = {
    topic: analysis.topic,
    tone: analysis.tone,
    hookPattern: analysis.hookPattern,
    caption: analysis.captionOriginal,
    slides: analysis.slides.map((s) => ({
      index: s.index,
      purpose: s.purpose,
      visualDescription: s.visualDescription,
      texts: s.textBlocks.map((b) => ({
        id: b.id,
        role: b.role,
        text: b.originalText,
        maxCharsHint: Math.max(4, Math.round(b.originalText.length * (info.lang === 'es' ? 1.1 : 0.9))),
      })),
    })),
    videoScenes: analysis.videoScenes,
  };

  const prompt = `You are a top ${info.language} Instagram creator and localization expert.
Recreate this viral post for ${info.nameKo} (${info.language}) audiences so it performs as well as the original there.

Audience & style: ${info.audience}

Rules:
1. Transcreate, don't translate: keep the meaning, the hook formula ("${analysis.hookPattern}") and the emotional punch, but phrase it the way a native creator would. Replace foreign-only references with local equivalents when it helps.
2. Each text must fit the same design box: stay close to maxCharsHint, keep the same number of line breaks ("\\n") roughly, and keep headlines short and punchy.
3. Return EVERY text id exactly as given. Keep account handles unchanged.
4. imagePrompt (English): a detailed prompt for an ORIGINAL image that conveys the same meaning as visualDescription but adapted to ${info.nameKo} (people, setting, objects, food, signage style should feel local). Describe subject, composition, lighting, style and color palette. It must NOT ask for any text or letters.
5. caption: a full ${info.language} caption in the style of a viral post there (strong first line, line breaks, emojis only if the original uses them, a save/share/comment call to action). ${credit ? `End the caption with a credit line: "${info.creditLabel}: ${credit}".` : ''} Do not put hashtags in the caption.
6. hashtags: 10–15 hashtags actually used in ${info.nameKo} for this topic (mix of big and niche), each starting with #.
7. hookAlternatives: 5 alternative first-slide hooks in ${info.language}, same length as the original headline.
8. postingTip: IN KOREAN — best days/times to post for ${info.nameKo} (local time) and one tip for this topic.
9. culturalNotes: IN KOREAN — 2–5 notes about what you changed for the local audience and why.
10. If videoScenes exist: videoSubtitles = translated subtitles (same timings, split long lines), and videoScenePrompts = one English text-to-video prompt per scene adapted to ${info.nameKo}. Otherwise return empty arrays.

Post data:
${JSON.stringify(compact, null, 2)}`;

  const res = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { responseMimeType: 'application/json', responseSchema: localizationSchema, temperature: 0.7 },
  });
  const raw = parseJson<Omit<Localization, 'country'>>(res.text);
  return {
    country,
    caption: raw.caption ?? '',
    hashtags: (raw.hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`)),
    hookAlternatives: raw.hookAlternatives ?? [],
    postingTip: raw.postingTip ?? '',
    culturalNotes: raw.culturalNotes ?? [],
    slides: raw.slides ?? [],
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
      uppercase: lang === 'es' ? b.uppercase : false,
      italic: lang === 'es' ? b.italic : false,
    };
  });
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
