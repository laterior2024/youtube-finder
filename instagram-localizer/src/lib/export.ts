import type JSZip from 'jszip';
import type { AspectRatio, CountryCode, CountryResult } from '../types';
import { slideToBlob } from './render';
import { COUNTRIES } from './countries';
import { finalCaption, altTextFile } from './gemini';
import { toSrt } from './files';

export async function addCountryToZip(zip: JSZip, result: CountryResult, country: CountryCode, aspect: AspectRatio, prefix = '') {
  if (result.slides.some(s => s.bgStatus === 'loading')) throw new Error('이미지 생성이 끝난 뒤 다운로드해 주세요.');
  for (const s of result.slides) {
    zip.file(`${prefix}${country}_slide_${String(s.index + 1).padStart(2, '0')}.png`, await slideToBlob(s, COUNTRIES[country].lang, aspect));
  }
  const loc = result.localization;
  zip.file(`${prefix}caption.txt`, finalCaption(loc));
  if (loc.altTexts.some(Boolean)) zip.file(`${prefix}alt_text.txt`, altTextFile(loc));
  if (loc.videoSubtitles.length) zip.file(`${prefix}subtitles.srt`, toSrt(loc.videoSubtitles));
  if (loc.videoScenePrompts.length) zip.file(`${prefix}video_scene_prompts.txt`, loc.videoScenePrompts.map((p,i) => `Scene ${i+1}\n${p}`).join('\n\n'));
  const unfinished = result.slides.filter(s => s.bgStatus === 'error' || (!s.background && ['photo','illustration'].includes(s.backgroundType)));
  if (unfinished.length) zip.file(`${prefix}미완성_안내.txt`, `배경이 완성되지 않은 슬라이드: ${unfinished.map(s => s.index+1).join(', ')}\n편집 화면의 색상 배경으로 내보냈습니다.`);
}
