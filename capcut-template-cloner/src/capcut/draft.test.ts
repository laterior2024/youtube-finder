import { describe, expect, it } from 'vitest';
import type { TemplateSpec } from '../../spec/template-spec';
import example from '../../spec/example-template.json';
import { buildDraftFiles, DRAFT_PATH_PLACEHOLDER, imagesForSpec, textsForSpec } from './draft';

const spec = example as unknown as TemplateSpec;

describe('buildDraftFiles', () => {
  const files = buildDraftFiles(spec, imagesForSpec(spec), textsForSpec(spec), { draftName: '틀복사_테스트', now: 0 });
  const content = JSON.parse(files['draft_content.json']);
  const meta = JSON.parse(files['draft_meta_info.json']);
  const segs = (type: string) => content.tracks.filter((t: any) => t.type === type).flatMap((t: any) => t.segments);

  it('0단계 T2와 같은 값 (phase0 파이썬 결과와 비교)', () => {
    expect(content.canvas_config).toEqual({ width: 1080, height: 1920, ratio: 'original' });
    const video = segs('video');
    expect(video).toHaveLength(4);
    const logo = video.find((s: any) => s.clip.alpha === 0.9);
    expect(logo.clip.transform.x).toBeCloseTo(0.74, 2);
    expect(logo.clip.transform.y).toBeCloseTo(-0.68, 2);
    expect(logo.clip.scale.x).toBeCloseTo(0.14, 2);

    const texts = content.materials.texts.map((m: any) => JSON.parse(m.content));
    expect(texts[0].styles[0].size).toBe(15.6);
    expect(texts[1].styles[0].size).toBe(11.6);
    expect(texts[1].styles[0].strokes[0].width).toBeCloseTo(0.08, 5);
    const text = segs('text');
    expect(text[0].clip.transform.y).toBeCloseTo(0.76, 5);
    expect(text[1].clip.transform.y).toBeCloseTo(-0.4, 5);
  });

  it('자막 3개는 한 트랙에 시간 순서대로, 제목은 다른 트랙', () => {
    const textTracks = content.tracks.filter((t: any) => t.type === 'text');
    expect(textTracks.map((t: any) => t.segments.length)).toEqual([1, 3]);
    expect(textTracks[1].segments.map((s: any) => s.target_timerange.start)).toEqual([0, 3000000, 6000000]);
  });

  it('소재 경로는 초안 폴더 기준 자리표시 (T4 방식)', () => {
    for (const v of content.materials.videos) expect(v.path.startsWith(`${DRAFT_PATH_PLACEHOLDER}/tbc_assets/`)).toBe(true);
  });

  it('모든 참조가 실제 소재를 가리킨다', () => {
    const ids = new Set(Object.values(content.materials).flat().map((m: any) => m.id));
    for (const t of content.tracks) {
      for (const s of t.segments) {
        expect(ids.has(s.material_id)).toBe(true);
        for (const r of s.extra_material_refs) expect(ids.has(r)).toBe(true);
      }
    }
  });

  it('메타 정보', () => {
    expect(meta.draft_name).toBe('틀복사_테스트');
    expect(meta.draft_id).toMatch(/^[0-9A-F-]{36}$/);
    expect(files['draft_info.json']).toBe(files['draft_content.json']);
  });
});
