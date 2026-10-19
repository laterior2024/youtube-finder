import test from 'node:test';
import assert from 'node:assert/strict';
import { drawTextBlock } from '../src/lib/render';
import { manualResult } from '../src/lib/manual';
import { COUNTRIES, COUNTRY_ORDER } from '../src/lib/countries';
import { localizePost, writeCaption, generateBackground } from '../src/lib/gemini';
import type { PostAnalysis } from '../src/types';

const block = manualResult({ images: [], caption: '', credit: '', sourceUrl: '', video: null }, 'KR').slides[0].textBlocks[0];
const analysis: PostAnalysis = { topic: 'Kyoto tofu', summaryKo: '교토 두부', whyViral: [], hookPattern: '', tone: 'informative', captionOriginal: 'Kyoto tofu costs 500 yen.',
  slides: [{ index: 0, purpose: 'content', visualDescription: 'tofu in Kyoto', backgroundType: 'photo', backgroundColors: [], textBlocks: [{ ...block, id: 'b1', originalText: 'Kyoto tofu: 500 yen' }] }], videoScenes: [], videoSummary: '' };

test('수동 크기는 상자 높이와 무관하게 실제 픽셀 크기가 증가하고 기존 자동맞춤은 보존', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { fonts: { load: async () => [] } } });
  const sizes: number[] = [], widths: number[] = [];
  const ctx: any = { font: '', measureText(t: string) { return { width: Array.from(t).length * Number(this.font.match(/ (\d+)px/)[1]) * .55 }; },
    save() {}, restore() {}, fillText(t: string) { sizes.push(Number(this.font.match(/ (\d+)px/)[1])); widths.push(this.measureText(t).width); } };
  try {
    const b = { ...block, text: 'Title', shadow: false, x: 1, y: 10, w: 98, h: 2, autoFit: false, fontSizePct: 10 };
    await drawTextBlock(ctx, b, 'en', 1080, 1080); assert.equal(sizes.at(-1), 108);
    await drawTextBlock(ctx, { ...b, fontSizePct: 20 }, 'en', 1080, 1080); assert.equal(sizes.at(-1), 216);
    await drawTextBlock(ctx, { ...b, autoFit: undefined }, 'en', 1080, 1080); assert.ok(sizes.at(-1)! < 20);
    widths.length = 0;
    await drawTextBlock(ctx, { ...b, text: 'A Donaudampfschifffahrtsgesellschaft', w: 40 }, 'de', 1080, 1080);
    assert.ok(widths.every(w => w <= 432), 'long words after a short word must also wrap');
  } finally { if (original) Object.defineProperty(globalThis, 'document', original); else Reflect.deleteProperty(globalThis, 'document'); }
});

test('10개 국가 번역 요청은 원문 사실과 언어를 유지하고 빠진 번역을 성공으로 처리하지 않음', async () => {
  for (const country of COUNTRY_ORDER) {
    let prompt = '';
    const ai: any = { models: { generateContent: async (args: any) => { prompt = args.contents; return { text: JSON.stringify({ slides: [{ index: 0, texts: [{ id: 'b1', text: 'translated fixture' }], imagePrompt: 'tofu' }] }) }; } } };
    const result = await localizePost(ai, 'test', analysis, country);
    assert.equal(result.country, country); assert.ok(prompt.includes(COUNTRIES[country].language));
    assert.ok(prompt.includes(analysis.captionOriginal)); assert.match(prompt, /LANGUAGE TRANSLATION/);
    assert.doesNotMatch(prompt, /Transcreate, don't translate|Use euro prices|Use Japanese examples|Use R\$ prices/);
  }
  const ai: any = { models: { generateContent: async () => ({ text: JSON.stringify({ slides: [{ index: 0, texts: [] }] }) }) } };
  await assert.rejects(localizePost(ai, 'test', analysis, 'JP'), /일부 글자가 빠졌/);
});

test('설명글 번역과 이미지 생성에 실제 본문과 장별 내용이 전달되고 생성 호출 수는 증가하지 않음', async () => {
  const calls: any[] = [];
  const ai: any = { models: { generateContent: async (args: any) => { calls.push(args); return args.config.responseSchema
    ? { text: JSON.stringify({ caption: '교토 두부 가격은 500엔입니다.', hashtags: ['#두부', '#교토', '#음식'] }) }
    : { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'test' } }] } }] }; } } };
  const caption = await writeCaption(ai, 'test', analysis, 'KR', '');
  assert.match(calls[0].contents, /Translate the source post faithfully into Korean/);
  assert.doesNotMatch(calls[0].contents, /not a translation|Use Korean examples/);
  await generateBackground(ai, 'test', { mode: 'new', prompt: 'tofu', content: caption.caption, reference: null, aspect: '4:5', textBlocks: [{ ...block, text: '교토 두부 500엔' }] });
  assert.equal(calls.length, 2);
  assert.ok(calls[1].contents[0].parts[0].text.includes(caption.caption));
  assert.ok(calls[1].contents[0].parts[0].text.includes('교토 두부 500엔'));
  assert.match(calls[1].contents[0].parts[0].text, /follow the content/);
});
