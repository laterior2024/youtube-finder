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
