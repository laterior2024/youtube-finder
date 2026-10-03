import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { addCountryToZip } from '../src/lib/export.ts';
import type { CountryResult } from '../src/types.ts';

test('video-only ZIP includes captions, subtitles and scene prompts for single and bulk export', async () => {
  const result = { slides: [], localization: { caption: '설명글', ctaShare: '', ctaComment: '', creditLine: '', hashtags: [], altTexts: [], videoSubtitles: [{ start: 0, end: 2, text: '자막' }], videoScenePrompts: ['A calm sea'] } } as unknown as CountryResult;
  for (const prefix of ['', 'post-01/KR/']) {
    const zip = new JSZip();
    await addCountryToZip(zip, result, 'KR', '4:5', prefix);
    const reopened = await JSZip.loadAsync(await zip.generateAsync({type:'nodebuffer'}));
    assert.match(await reopened.file(prefix+'caption.txt')!.async('string'), /설명글/);
    assert.match(await reopened.file(prefix+'subtitles.srt')!.async('string'), /00:00:00,000 --> 00:00:02,000/);
    assert.match(await reopened.file(prefix+'video_scene_prompts.txt')!.async('string'), /A calm sea/);
  }
});
