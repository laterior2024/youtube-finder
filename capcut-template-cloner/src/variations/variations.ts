/**
 * 비슷하지만 다른 틀 만들기.
 * "먹히는 이유"(정보 위계·대비·영상 비율)는 지키고 겉모습(색·굵기·배치)만 바꾼다.
 * 규칙으로 만들어서 AI 비용이 없고, 같은 입력이면 항상 같은 결과가 나온다.
 */
import type { BoxLayer, Hex, Layer, TemplateSpec, TextStyle } from '../../spec/template-spec';
import { contrastRatio, hexToHsl, hslToHex, isNeutral } from '../lib/color';

export type Preset = NonNullable<TemplateSpec['variation']>['preset'];

export const PRESETS: { preset: Preset; suffix: string; title: string; description: string }[] = [
  { preset: 'faithful', suffix: '원본', title: '충실 복제', description: '원본 틀 그대로. 로고·채널명만 내 것으로 바꿔 쓰세요.' },
  { preset: 'color-swap', suffix: '컬러', title: '컬러 스왑', description: '배치는 그대로, 색만 바꿔요. 내 브랜드 색을 고르면 그 색으로 맞춰요.' },
  { preset: 'minimal', suffix: '미니멀', title: '미니멀', description: '박스를 살짝 투명하게, 글자는 한 단계 작고 차분하게.' },
  { preset: 'impact', suffix: '임팩트', title: '임팩트', description: '제목을 더 크게, 자막 테두리를 두껍게, 박스는 더 진하게.' },
  { preset: 'mirror', suffix: '반전', title: '위아래 반전', description: '제목과 로고 자리를 위아래로 바꿔요. 자막은 영상 안 같은 위치.' },
];

const SUFFIX_RE = new RegExp(`_(${PRESETS.map((p) => p.suffix).join('|')})$`);

export interface VariationOptions {
  /** 컬러 스왑 때 맞출 내 브랜드 색 */
  brandColor?: string;
}

export function makeVariations(base: TemplateSpec, opts: VariationOptions = {}): TemplateSpec[] {
  return PRESETS.map((p) => makeVariation(base, p.preset, opts));
}

export function makeVariation(base: TemplateSpec, preset: Preset, opts: VariationOptions = {}): TemplateSpec {
  const meta = PRESETS.find((p) => p.preset === preset)!;
  let layers: Layer[] = structuredClone(base.layers);
  if (preset === 'color-swap') layers = mapColors(layers, (c) => swapHue(c, opts.brandColor));
  if (preset === 'minimal') layers = minimal(layers);
  if (preset === 'impact') layers = impact(layers);
  if (preset === 'mirror') layers = mirror(layers);
  const spec: TemplateSpec = {
    ...structuredClone(base),
    id: `${base.id}_${preset}`,
    // 변형을 다시 변형해도 이름이 길어지지 않게 앞 변형 이름표는 뗀다
    name: `${base.name.replace(SUFFIX_RE, '')}_${meta.suffix}`,
    layers,
    variation: { baseTemplateId: base.id, preset, description: meta.description },
  };
  if (preset === 'color-swap') spec.palette = mapPalette(base.palette, (c) => swapHue(c, opts.brandColor));
  return enforceRules(spec);
}

// ── 프리셋 ─────────────────────────────────────────────────────

/** 색상환 회전: 기본 150°, 브랜드 색이 있으면 가장 진한 유채색이 그 색상이 되게 */
function swapHue(hex: string, brand?: string): Hex {
  if (isNeutral(hex)) return hex as Hex;
  const [h, s, l] = hexToHsl(hex);
  if (brand && !isNeutral(brand)) {
    const [bh, bs] = hexToHsl(brand);
    return hslToHex([bh, Math.max(s, bs * 0.9), l]);
  }
  return hslToHex([h + 150, s, l]);
}

function minimal(layers: Layer[]): Layer[] {
  return layers.map((l) => {
    if (l.kind === 'box') return { ...l, fill: { ...l.fill, opacity: Math.min(l.fill.opacity, 0.88) }, radiusPx: Math.max(l.radiusPx, 0) };
    if (l.kind === 'text-slot' || l.kind === 'caption') {
      const st = l.style;
      return {
        ...l,
        style: {
          ...st,
          sizePx: Math.round(st.sizePx * 0.9),
          font: { ...st.font, weight: Math.min(st.font.weight, 600) },
          lineColors: undefined,
          color: st.lineColors ? (st.lineColors[st.lineColors.length - 1] as Hex) : st.color,
          stroke: st.stroke ? { ...st.stroke, widthPx: Math.max(2, Math.round(st.stroke.widthPx * 0.6)) } : undefined,
        },
      };
    }
    return l;
  });
}

function impact(layers: Layer[]): Layer[] {
  return layers.map((l) => {
    if (l.kind === 'box') {
      return { ...l, fill: { ...l.fill, opacity: 1, colors: l.fill.colors.map((c) => darken(c, 0.7)) } };
    }
    if (l.kind === 'text-slot') {
      const grow = 1.12;
      const h = Math.min(l.rect.h * grow, 1 - l.rect.y);
      return { ...l, rect: { ...l.rect, y: Math.max(0, l.rect.y - (h - l.rect.h) / 2), h }, style: { ...l.style, sizePx: Math.round(l.style.sizePx * grow), font: { ...l.style.font, weight: 900 } } };
    }
    if (l.kind === 'caption') {
      const w = Math.max(8, Math.round((l.style.stroke?.widthPx ?? 6) * 1.4));
      return { ...l, style: { ...l.style, stroke: { color: l.style.stroke?.color ?? '#000000', widthPx: w }, font: { ...l.style.font, weight: 900 } } };
    }
    return l;
  });
}

/** 위아래 반전. 자막은 영상 영역 안에서 같은 상대 위치를 유지한다 */
function mirror(layers: Layer[]): Layer[] {
  const video = layers.find((l) => l.kind === 'video-area');
  const flip = <T extends Layer>(l: T): T => ({ ...l, rect: { ...l.rect, y: round(1 - l.rect.y - l.rect.h) } });
  const newVideo = video ? flip(video) : undefined;
  return layers.map((l) => {
    if (l.kind === 'caption' && video && newVideo) {
      const rel = l.rect.y - video.rect.y;
      return { ...l, rect: { ...l.rect, y: round(newVideo.rect.y + rel) } };
    }
    if (l.kind === 'box') return { ...flip(l), label: l.label.includes('상단') ? l.label.replace('상단', '하단') : l.label.replace('하단', '상단') };
    return flip(l);
  });
}

// ── 지켜야 할 규칙 ──────────────────────────────────────────────

/** 글자-배경 대비 4.5:1 이상, 쇼츠 아래쪽 UI(하단 12%)에 자막이 가리지 않게 */
export function enforceRules(spec: TemplateSpec): TemplateSpec {
  const boxes = spec.layers.filter((l): l is BoxLayer => l.kind === 'box');
  const bgFor = (l: Layer): string | null => {
    const cy = l.rect.y + l.rect.h / 2;
    const box = boxes.find((b) => cy >= b.rect.y && cy <= b.rect.y + b.rect.h && b.fill.opacity > 0.6);
    return box ? box.fill.colors[0] : null;
  };
  const fix = (fg: string, bg: string): Hex => {
    if (contrastRatio(fg, bg) >= spec.checks.minContrastRatio) return fg as Hex;
    // 색상은 두고 밝기만 조절해 대비를 맞춘다. 안 되면 흰/검
    const [h, s] = hexToHsl(fg);
    const bgLight = hexToHsl(bg)[2] > 0.5;
    for (let step = 1; step <= 10; step++) {
      const c = hslToHex([h, s, bgLight ? 0.5 - step * 0.05 : 0.5 + step * 0.05]);
      if (contrastRatio(c, bg) >= spec.checks.minContrastRatio) return c;
    }
    return bgLight ? '#000000' : '#FFFFFF';
  };
  const layers = spec.layers.map((l) => {
    if (l.kind !== 'text-slot' && l.kind !== 'caption') return l;
    let rect = l.rect;
    if (l.kind === 'caption' && spec.canvas.aspect === '9:16' && rect.y + rect.h > 0.88) rect = { ...rect, y: round(0.88 - rect.h) };
    const bg = bgFor(l);
    // 배경이 영상이면 테두리가 대비를 책임진다
    const against = bg ?? l.style.stroke?.color;
    if (!against) return { ...l, rect };
    const style: TextStyle = {
      ...l.style,
      color: fix(l.style.color, against),
      lineColors: l.style.lineColors?.map((c) => fix(c, against)),
    };
    return { ...l, rect, style };
  });
  return { ...spec, layers };
}

// ── 보조 ───────────────────────────────────────────────────────

function mapColors(layers: Layer[], f: (c: string) => Hex): Layer[] {
  return layers.map((l) => {
    if (l.kind === 'box') return { ...l, fill: { ...l.fill, colors: l.fill.colors.map(f) } };
    if (l.kind === 'text-slot' || l.kind === 'caption') {
      const st = l.style;
      return {
        ...l,
        style: {
          ...st, color: f(st.color), highlightColor: st.highlightColor && f(st.highlightColor), lineColors: st.lineColors?.map(f),
          stroke: st.stroke && { ...st.stroke, color: f(st.stroke.color) },
        },
      };
    }
    return l;
  });
}

function mapPalette(p: TemplateSpec['palette'], f: (c: string) => Hex): TemplateSpec['palette'] {
  return { primary: f(p.primary), secondary: f(p.secondary), accent: f(p.accent), text: f(p.text), background: f(p.background) };
}

function darken(hex: string, k: number): Hex {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex([h, s, l * k]);
}

const round = (v: number) => Math.round(v * 1000) / 1000;
