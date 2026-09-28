import { describe, expect, it } from 'vitest';
import type { BoxLayer, CaptionLayer, TextSlotLayer } from '../../spec/template-spec';
import { analyzeFrames } from './detect';
import type { Frame } from './frames';

const W = 1080, H = 1920;

function frame(): Frame {
  return { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
}

function fill(f: Frame, x: number, y: number, w: number, h: number, [r, g, b]: number[]) {
  for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) {
      const i = (yy * W + xx) * 4;
      f.data[i] = r; f.data[i + 1] = g; f.data[i + 2] = b; f.data[i + 3] = 255;
    }
  }
}

/** 글자 흉내: 글자 모양 대신 (테두리 있는) 막대들 */
function fakeText(f: Frame, cx: number, top: number, glyphH: number, count: number, color: number[], stroke = 0) {
  const gw = Math.round(glyphH * 0.8), gap = Math.round(glyphH * 0.25);
  const total = count * gw + (count - 1) * gap;
  let x = Math.round(cx - total / 2);
  for (let i = 0; i < count; i++) {
    if (stroke) fill(f, x - stroke, top - stroke, gw + stroke * 2, glyphH + stroke * 2, [0, 0, 0]);
    // 글자 안쪽에 구멍을 뚫어 획처럼 보이게
    fill(f, x, top, gw, glyphH, color);
    fill(f, x + gw * 0.3, top + glyphH * 0.3, gw * 0.4, glyphH * 0.4, stroke ? [0, 0, 0] : [11, 11, 11]);
    x += gw + gap;
  }
}

function makeFrames(n: number): Frame[] {
  return Array.from({ length: n }, (_, k) => {
    const f = frame();
    // 영상 영역: 장면마다 다른 색/무늬
    for (let y = 422; y < 1498; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        // 실제 영상처럼 부드러운 색 변화 (장면마다 다름)
        f.data[i] = 120 + 90 * Math.sin((x + k * 200) / 140);
        f.data[i + 1] = 110 + 80 * Math.cos((y + k * 150) / 190);
        f.data[i + 2] = 100 + 70 * Math.sin((x + y + k * 300) / 230);
        f.data[i + 3] = 255;
      }
    }
    fill(f, 0, 0, W, 422, [11, 11, 11]); // 상단 박스
    fill(f, 0, 1498, W, 422, [11, 11, 11]); // 하단 박스
    fakeText(f, W / 2, 150, 66, 8, [255, 255, 255]); // 고정 제목
    fill(f, 880, 1560, 130, 130, [240, 240, 240]); // 로고 자리
    fakeText(f, W / 2, 1270, 50, 6 + k, [255, 255, 255], 8); // 장면마다 다른 자막
    return f;
  });
}

describe('analyzeFrames', () => {
  const { spec, notes } = analyzeFrames(makeFrames(3));
  const boxes = spec.layers.filter((l): l is BoxLayer => l.kind === 'box');
  const title = spec.layers.find((l): l is TextSlotLayer => l.kind === 'text-slot');
  const caption = spec.layers.find((l): l is CaptionLayer => l.kind === 'caption');

  it('세로 캔버스로 인식', () => {
    expect(spec.canvas).toMatchObject({ aspect: '9:16', widthPx: 1080, heightPx: 1920 });
  });

  it('위아래 검은 박스를 찾고 색을 잰다', () => {
    expect(boxes.length).toBe(2);
    const [top, bottom] = [...boxes].sort((a, b) => a.rect.y - b.rect.y);
    expect(top.rect.y).toBe(0);
    expect(top.rect.h).toBeCloseTo(422 / 1920, 1);
    expect(bottom.rect.y + bottom.rect.h).toBeCloseTo(1, 5);
    expect(top.fill.colors[0]).toBe('#000000'); // #0B0B0B는 검정으로 맞춤
  });

  it('영상 영역', () => {
    const video = spec.layers.find((l) => l.kind === 'video-area')!;
    expect(video.rect.y).toBeCloseTo(422 / 1920, 1);
    expect(video.rect.h).toBeCloseTo(1076 / 1920, 1);
  });

  it('상단 박스 안의 고정 제목: 흰색, 크기, 한 줄', () => {
    expect(title).toBeDefined();
    expect(title!.style.color).toBe('#FFFFFF');
    expect(title!.style.sizePx).toBeGreaterThan(70);
    expect(title!.style.sizePx).toBeLessThan(85);
    expect(title!.maxLines).toBe(1);
    expect(title!.rect.y + title!.rect.h).toBeLessThan(422 / 1920);
  });

  it('자막: 위치, 흰 글자 + 검은 테두리 두께', () => {
    expect(caption, notes.join('\n')).toBeDefined();
    const cy = caption!.rect.y + caption!.rect.h / 2;
    expect(cy).toBeCloseTo((1270 + 25) / 1920, 1);
    expect(caption!.style.color).toBe('#FFFFFF');
    expect(caption!.style.stroke?.color).toBe('#000000');
    expect(caption!.style.stroke?.widthPx).toBeGreaterThanOrEqual(7);
    expect(caption!.style.stroke?.widthPx).toBeLessThanOrEqual(9);
  });

  it('로고 자리', () => {
    const logo = spec.layers.find((l) => l.kind === 'logo');
    expect(logo).toBeDefined();
    expect(logo!.rect.x).toBeGreaterThan(0.75);
  });

  it('스크린샷 1장이면 안내 문구', () => {
    const one = analyzeFrames(makeFrames(1));
    expect(one.notes[0]).toContain('1장');
  });
});

describe('mergeTextLines', () => {
  it('두 줄 제목은 하나로, 떨어진 글자는 따로', async () => {
    const { mergeTextLines } = await import('./detect');
    const merged = mergeTextLines([
      { left: 100, top: 150, width: 800, height: 60 },
      { left: 120, top: 225, width: 760, height: 60 },
      { left: 100, top: 500, width: 300, height: 40 },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({ left: 100, top: 150, width: 800, height: 135 });
  });
});

describe('채널형 틀 (영상마다 제목이 다른 스크린샷 + 플레이어 버튼)', () => {
  const NAVY = [0, 5, 27];
  const frames = [0, 1, 2].map((k) => {
    const f = frame();
    const dy = k === 2 ? 2 : 0; // 스크린샷마다 조금 어긋남
    fill(f, 0, 0, W, H, NAVY);
    for (let y = 464; y < 1448; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        f.data[i] = 120 + 90 * Math.sin((x + k * 200) / 140);
        f.data[i + 1] = 110 + 80 * Math.cos((y + k * 150) / 190);
        f.data[i + 2] = 100 + 70 * Math.sin((x + y + k * 300) / 230);
      }
    }
    // 플레이어 버튼·채널명·구분선
    fill(f, 20, 30 + dy, 70, 60, [255, 255, 255]);
    fill(f, 300, 40 + dy, 400, 40, [230, 230, 230]);
    fill(f, 960, 30 + dy, 70, 60, [255, 255, 255]);
    fill(f, 0, 142 + dy, W, 4, [255, 255, 255]);
    if (k === 1) fill(f, 0, 0, 3, H, [177, 178, 185]); // 캡처 테두리
    // 영상마다 다른 제목: 첫 줄 초록, 둘째 줄 흰색
    fakeText(f, W / 2, 200 + dy, 80, 6 + k, [91, 255, 0]);
    fakeText(f, W / 2, 310 + dy, 80, 8 - k, [255, 255, 255]);
    // 가운데 로고 (모든 장면 같음)
    fill(f, 380, 1680 + dy, 110, 110, [60, 200, 90]);
    fakeText(f, 620, 1700 + dy, 60, 3, [255, 255, 255]);
    // 자막: 장면마다 높이가 다름, 노란 글자 + 검은 테두리
    if (k === 0) fakeText(f, W / 2, 1300, 50, 6, [255, 225, 0], 7);
    if (k === 1) fakeText(f, W / 2, 1000, 50, 7, [255, 225, 0], 7);
    return f;
  });
  const { spec, notes } = analyzeFrames(frames);
  const of = <K extends string>(kind: K) => spec.layers.filter((l) => l.kind === kind);

  it('위아래 남색 박스', () => {
    const boxes = of('box') as BoxLayer[];
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => b.fill.colors[0] === '#00051B')).toBe(true);
  });

  it('플레이어 버튼은 빼고 안내한다', () => {
    expect(spec.layers.every((l) => l.rect.y + l.rect.h > 0.1 || l.kind === 'box')).toBe(true);
    expect(notes.join()).toContain('플레이어 버튼');
  });

  it('바뀌는 제목 → 두 줄, 줄마다 색', () => {
    const titles = of('text-slot') as TextSlotLayer[];
    expect(titles).toHaveLength(1);
    expect(titles[0].maxLines).toBe(2);
    expect(titles[0].style.lineColors?.[0]).toBe('#5BFF00');
    expect(titles[0].style.lineColors?.[1]).toBe('#FFFFFF');
    expect(titles[0].rect.y).toBeGreaterThan(0.08);
  });

  it('가운데 로고는 로고 자리 하나로', () => {
    const logos = of('logo');
    expect(logos).toHaveLength(1);
    expect(logos[0].rect.x).toBeLessThan(0.4);
    expect(logos[0].rect.x + logos[0].rect.w).toBeGreaterThan(0.6);
  });

  it('높이가 다른 자막도 같은 모양이면 자막 자리로', () => {
    const cap = of('caption')[0] as CaptionLayer;
    expect(cap).toBeDefined();
    expect(cap.style.color).toMatch(/^#F/);
    expect(cap.style.stroke?.widthPx).toBeGreaterThanOrEqual(6);
    expect(cap.confidence).toBeLessThan(0.6);
  });
});
