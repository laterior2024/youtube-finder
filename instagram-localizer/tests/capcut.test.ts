import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { createCapcutDraft } from '../src/lib/capcut-draft';
import { buildCapcutArchive } from '../src/lib/capcut-export';
import { manualResult } from '../src/lib/manual';
import type { CountryResult } from '../src/types';
import type { slideToBlob } from '../src/lib/render';

const makeResult = () => {
  const result = manualResult({ caption: '안녕 🌊 "quote" $value', images: [], video: null, sourceUrl: '', credit: '' }, 'KR');
  result.slides = [result.slides[0], structuredClone(result.slides[0])];
  result.slides[0].index = 99; result.slides[1].index = 99; // export follows displayed order, not stale ids
  result.slides[0].textBlocks[0].text = '하나\n둘 🌊';
  result.slides[1].textBlocks = [];
  result.localization.videoSubtitles = [{ start: 60, end: 63, text: '영상 자막' }];
  return result;
};
const installer = await readFile(new URL('../src/lib/capcut-install.ps1', import.meta.url), 'utf8');
const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
const render: typeof slideToBlob = async () => png;

test('CapCut draft has resolvable ids, relative media, contiguous microsecond timings and independent layers', () => {
  const scenes = [
    { background: 'media/001_background.png', textLayers: ['media/001_text_01.png', 'media/001_text_02.png'] },
    { background: 'media/002_background.png', textLayers: [] },
  ];
  const { content, meta } = createCapcutDraft(scenes, 1080, 1350);
  assert.equal(content.duration, 6_000_000);
  assert.equal(content.canvas_config.height, 1350);
  assert.equal(content.id, meta.draft_id);
  assert.equal(content.tracks.length, 3);
  assert.deepEqual(content.tracks.map(t => t.segments.length), [2, 1, 1]);
  assert.deepEqual(content.tracks[0].segments.map(s => s.target_timerange),
    [{ start: 0, duration: 3_000_000 }, { start: 3_000_000, duration: 3_000_000 }]);
  const ids = [...content.materials.videos, ...content.materials.speeds].map(m => (m as { id: string }).id);
  assert.equal(new Set(ids).size, ids.length);
  for (const track of content.tracks) for (const segment of track.segments) {
    assert.ok(ids.includes(segment.material_id as string));
    for (const ref of segment.extra_material_refs as string[]) assert.ok(ids.includes(ref));
  }
  assert.throws(() => createCapcutDraft([], 1080, 1080), /사진/);
  assert.throws(() => createCapcutDraft([{ background: '../outside.png', textLayers: [] }], 1080, 1080), /경로/);
});

test('archive contains ordered complete images, separate layers, Korean/emoji text and separate video timing', async () => {
  const result = makeResult(), before = structuredClone(result);
  const calls: Parameters<typeof slideToBlob>[] = [];
  const progress: string[] = [];
  const file = await buildCapcutArchive(result, 'KR', '9:16', m => progress.push(m), async (...args) => {
    calls.push(args); return png;
  }, installer);
  assert.equal(file.name, 'instagram_KR_capcut.zip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const draft = JSON.parse(await zip.file('desktop-draft/draft_content.json')!.async('string'));
  assert.equal(draft.canvas_config.height, 1920);
  for (const material of draft.materials.videos) assert.ok(zip.file('desktop-draft/' + material.path), material.path);
  assert.ok(zip.file('photos/001.png')); assert.ok(zip.file('photos/002.png'));
  assert.match(await zip.file('text/001.txt')!.async('string'), /둘 🌊/);
  assert.match(await zip.file('slides.srt')!.async('string'), /00:00:00,000 --> 00:00:03,000/);
  assert.match(await zip.file('video-subtitles.srt')!.async('string'), /00:01:00,000 --> 00:01:03,000/);
  assert.equal(await zip.file('install-capcut.ps1')!.async('string'), installer);
  assert.match(await zip.file('사용방법.txt')!.async('string'), /호환성은 아직 검증하지 않았/);
  assert.ok(calls.some(c => c[3]?.background === false && c[3]?.effects === false));
  assert.ok(calls.some(c => c[3]?.text === false));
  assert.ok(calls.every(c => c[3]?.strictImages));
  assert.equal(progress.length, 3);
  assert.deepEqual(result, before);
});

test('CapCut export snapshots edited posts and excludes credentials, source URLs and input image URLs', async () => {
  const result = makeResult();
  Object.assign(result, { apiKey: 'private-marker', userSession: 'private-marker' });
  result.slides[0].sourceImage = 'https://example.invalid/private-marker.png';
  const file = await buildCapcutArchive(result, 'KR', '1:1', () => {
    result.slides[0].textBlocks[0].text = 'changed-during-export';
    result.localization.caption = 'changed-during-export';
  }, render, installer);
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  for (const [name, entry] of Object.entries(zip.files)) if (!entry.dir && !name.endsWith('.png')) {
    const text = await entry.async('string');
    assert.doesNotMatch(text, /private-marker|changed-during-export/, name);
  }
});

test('empty, loading and missing-photo exports fail before rendering; image load failure is not a successful ZIP', async () => {
  let renders = 0;
  const spy: typeof render = async () => { renders++; return png; };
  await assert.rejects(buildCapcutArchive({ ...makeResult(), slides: [] }, 'KR', '4:5', undefined, spy, installer), /사진/);
  const busy = makeResult(); busy.slides[0].bgStatus = 'loading';
  await assert.rejects(buildCapcutArchive(busy, 'KR', '4:5', undefined, spy, installer), /끝난 뒤/);
  const missing = makeResult(); missing.slides[0].backgroundType = 'photo'; missing.slides[0].background = null;
  await assert.rejects(buildCapcutArchive(missing, 'KR', '4:5', undefined, spy, installer), /완성되지/);
  assert.equal(renders, 0);
  await assert.rejects(buildCapcutArchive(makeResult(), 'KR', '4:5', undefined, async () => { throw Error('image failed'); }, installer), /image failed/);
  const huge = new Blob([new Uint8Array(81 * 1024 * 1024)]);
  await assert.rejects(buildCapcutArchive(makeResult(), 'KR', '4:5', undefined, async () => huge, installer), /80MB/);
});

test('single image without text produces a one-track draft and no empty SRT', async () => {
  const result = makeResult(); result.slides = [result.slides[1]]; result.localization.videoSubtitles = [];
  const zip = await JSZip.loadAsync(await (await buildCapcutArchive(result as CountryResult, 'KR', '1:1', undefined, render, installer)).arrayBuffer());
  const draft = JSON.parse(await zip.file('desktop-draft/draft_content.json')!.async('string'));
  assert.equal(draft.duration, 3_000_000); assert.equal(draft.tracks.length, 1);
  assert.equal(zip.file('slides.srt'), null);
  assert.equal(zip.file('video-subtitles.srt'), null);
});
