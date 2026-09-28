import { describe, expect, it } from 'vitest';
import type { BoxLayer, CaptionLayer, Layer, TemplateSpec, TextSlotLayer } from '../../spec/template-spec';
import { boxLayer, DEFAULT_FONT, makeSpec, videoLayer } from '../analyze/detect';
import { buildDraftFiles, imagesForSpec, textsForSpec } from '../capcut/draft';
import { contrastRatio, hexToHsl } from '../lib/color';
import { makeVariation, makeVariations } from './variations';

/** 세파민 채널과 비슷한 틀: 남색 위아래 박스, 초록/흰 두 줄 제목, 가운데 로고, 노란 자막 */
function channelSpec(): TemplateSpec {
  const layers: Layer[] = [
    videoLayer({ x: 0, y: 0.242, w: 1, h: 0.512 }, 1),
    boxLayer({ x: 0, y: 0, w: 1, h: 0.242 }, '#00051B', '상단 박스', 1),
    boxLayer({ x: 0, y: 0.754, w: 1, h: 0.246 }, '#00071E', '하단 박스', 1),
    {
      id: 'title_a', kind: 'text-slot', role: 'title', label: '제목', rect: { x: 0.02, y: 0.063, w: 0.96, h: 0.174 }, zIndex: 3, confidence: 1,
      maxLines: 2, sampleText: '첫 줄\n둘째 줄',
      style: { font: DEFAULT_FONT, alternatives: [], sizePx: 120, lineHeight: 1.2, letterSpacing: 0, align: 'center', color: '#FFFFFF', lineColors: ['#5FF915', '#FFFFFF'] },
    },
    { id: 'logo_a', kind: 'logo', label: '로고 자리', rect: { x: 0.337, y: 0.871, w: 0.322, h: 0.081 }, zIndex: 5, confidence: 1, corner: 'custom', opacity: 1 },
    {
      id: 'caption_a', kind: 'caption', label: '자막', rect: { x: 0.1, y: 0.62, w: 0.8, h: 0.08 }, zIndex: 4, confidence: 0.5,
      maxCharsPerLine: 14, maxLines: 2, emphasisRule: 'none',
      style: { font: DEFAULT_FONT, alternatives: [], sizePx: 80, lineHeight: 1.2, letterSpacing: 0, align: 'center', color: '#DFED1A', stroke: { color: '#000000', widthPx: 6 } },
    },
  ];
  return { ...makeSpec({ w: 1080, h: 1920, aspect: '9:16' }, layers), name: '세파민형' };
}

const get = <K extends Layer['kind']>(s: TemplateSpec, kind: K) => s.layers.find((l) => l.kind === kind) as Extract<Layer, { kind: K }>;

describe('makeVariations', () => {
  const base = channelSpec();
  const vars = makeVariations(base);

  it('5개, 이름·id가 서로 다름 (캡컷 초안 이름이 겹치지 않게)', () => {
    expect(vars).toHaveLength(5);
    expect(new Set(vars.map((v) => v.name)).size).toBe(5);
    expect(new Set(vars.map((v) => v.id)).size).toBe(5);
    expect(vars[0].name).toBe('세파민형_원본');
    expect(makeVariation(vars[1], 'mirror').name).toBe('세파민형_반전');
  });

  it('충실 복제는 원본과 같다', () => {
    expect(vars[0].layers).toEqual(base.layers);
  });

  it('컬러 스왑: 유채색만 바뀌고 흰색·검정은 그대로', () => {
    const v = vars[1];
    const box = get(v, 'box') as BoxLayer;
    expect(box.fill.colors[0]).not.toBe('#00051B');
    const title = get(v, 'text-slot') as TextSlotLayer;
    expect(title.style.lineColors![0]).not.toBe('#5FF915');
    expect(title.style.lineColors![1]).toBe('#FFFFFF');
    expect((get(v, 'caption') as CaptionLayer).style.stroke!.color).toBe('#000000');
  });

  it('컬러 스왑 + 브랜드 색: 유채색이 브랜드 색상(hue)으로', () => {
    const v = makeVariation(base, 'color-swap', { brandColor: '#FF3366' });
    const hue = hexToHsl((get(v, 'text-slot') as TextSlotLayer).style.lineColors![0])[0];
    expect(Math.abs(hue - hexToHsl('#FF3366')[0])).toBeLessThan(3);
  });

  it('미니멀: 글자 작게, 박스 살짝 투명, 줄 색 통일', () => {
    const t = get(vars[2], 'text-slot') as TextSlotLayer;
    expect(t.style.sizePx).toBe(108);
    expect(t.style.lineColors).toBeUndefined();
    expect((get(vars[2], 'box') as BoxLayer).fill.opacity).toBeLessThanOrEqual(0.88);
  });

  it('임팩트: 제목 크게, 자막 테두리 두껍게', () => {
    expect((get(vars[3], 'text-slot') as TextSlotLayer).style.sizePx).toBe(134);
    expect((get(vars[3], 'caption') as CaptionLayer).style.stroke!.widthPx).toBeGreaterThanOrEqual(8);
  });

  it('위아래 반전: 제목은 아래, 로고는 위, 자막은 영상 안 같은 상대 위치', () => {
    const v = vars[4];
    const title = get(v, 'text-slot');
    expect(title.rect.y).toBeGreaterThan(0.75);
    expect(get(v, 'logo').rect.y).toBeLessThan(0.25);
    const video = get(v, 'video-area');
    const cap = get(v, 'caption');
    expect(cap.rect.y - video.rect.y).toBeCloseTo(0.62 - 0.242, 3);
  });

  it('모든 변형: 박스 위 글자 대비 4.5:1 이상, 자막은 화면 아래 12% 밖', () => {
    for (const v of vars) {
      const boxes = v.layers.filter((l): l is BoxLayer => l.kind === 'box');
      for (const t of v.layers.filter((l): l is TextSlotLayer => l.kind === 'text-slot')) {
        const cy = t.rect.y + t.rect.h / 2;
        const bg = boxes.find((b) => cy >= b.rect.y && cy <= b.rect.y + b.rect.h)!;
        for (const c of t.style.lineColors ?? [t.style.color]) expect(contrastRatio(c, bg.fill.colors[0])).toBeGreaterThanOrEqual(4.5);
      }
      const cap = get(v, 'caption');
      expect(cap.rect.y + cap.rect.h).toBeLessThanOrEqual(0.88 + 1e-9);
    }
  });

  it('대비가 모자라면 고친다 (어두운 박스 위 어두운 글자)', () => {
    const bad = structuredClone(base);
    (bad.layers.find((l) => l.kind === 'text-slot') as TextSlotLayer).style.lineColors = ['#102040', '#FFFFFF'];
    const v = makeVariation(bad, 'faithful');
    expect(contrastRatio((get(v, 'text-slot') as TextSlotLayer).style.lineColors![0], '#00051B')).toBeGreaterThanOrEqual(4.5);
  });

  it('모든 변형으로 캡컷 초안을 만들 수 있다', () => {
    for (const v of vars) {
      const files = buildDraftFiles(v, imagesForSpec(v), textsForSpec(v), { draftName: v.name });
      expect(JSON.parse(files['draft_content.json']).tracks.length).toBeGreaterThan(3);
    }
  });
});
