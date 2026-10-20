import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manualResult } from '../src/lib/manual';
import { defaultFontFor, COUNTRIES } from '../src/lib/countries';
import { thumbnailDefaults, editBlockText, THUMBNAIL_YELLOW } from '../src/lib/text-defaults';
import { saveImageBatch } from '../src/lib/batch-download';

const block = manualResult({ caption: '', images: [], video: null, sourceUrl: '', credit: '' }, 'KR').slides[0].textBlocks[0];

test('new titles use Pretendard; two/three explicit lines highlight only second line', () => {
  for (const country of Object.values(COUNTRIES)) assert.equal(defaultFontFor(country.lang, 'serif'), 'Pretendard Variable');
  for (const text of ['첫 줄\n둘째 줄', '첫 줄\n둘째 줄\n셋째 줄', '첫 문장. 두 문장. 세 문장.']) {
    const title = thumbnailDefaults([{ ...block, text }])[0];
    assert.equal(title.lineColors?.[1], THUMBNAIL_YELLOW);
    assert.equal(title.lineColors?.[0], block.color);
    assert.equal(title.lineColors?.filter(c => c === THUMBNAIL_YELLOW).length, 1);
  }
  const separate = thumbnailDefaults(['하나', '둘', '셋'].map((text, i) => ({ ...block, id: String(i), text })));
  assert.deepEqual(separate.map(b => b.lineColors?.[0]), [block.color, THUMBNAIL_YELLOW, block.color]);
});

test('single line stays plain; new title editing updates emphasis; manual and old colors remain', () => {
  assert.deepEqual(thumbnailDefaults([{ ...block, text: '한 줄' }])[0].lineColors, [block.color]);
  const automatic = editBlockText(block, '처음\n강조\n마지막');
  assert.equal(automatic.lineColors?.[1], THUMBNAIL_YELLOW);
  const custom = { ...automatic, autoThumbnailColor: false, lineColors: ['#ff0000', '#00ff00'] };
  assert.deepEqual(editBlockText(custom, '바꾼\n문구').lineColors, custom.lineColors);
  const old = { ...block, autoThumbnailColor: undefined, fontFamily: 'Nanum Myeongjo', lineColors: ['#ff0000'] };
  assert.equal(editBlockText(old, '보존').fontFamily, 'Nanum Myeongjo');
  assert.deepEqual(editBlockText(old, '보존').lineColors, ['#ff0000']);
});

test('bulk saves sequentially and reports progress without opening share', async () => {
  let active = 0; const written: number[] = [], progress: string[] = [];
  assert.equal(await saveImageBatch([1, 2, 3], async n => {
    assert.equal(++active, 1); await Promise.resolve(); written.push(n); active--; return true;
  }, s => progress.push(s)), true);
  assert.deepEqual(written, [1, 2, 3]); assert.equal(progress.length, 3);
  assert.match(progress[2], /3\/3/);
});

test('bulk failure preserves completed files, stops remaining work, and cancellation is not success', async () => {
  const attempted: number[] = [];
  await assert.rejects(saveImageBatch([1, 2, 3], async n => {
    attempted.push(n); if (n === 2) throw Error('용량 부족'); return true;
  }, () => {}), /3장 중 1장 처리 완료.*용량 부족/);
  assert.deepEqual(attempted, [1, 2]);
  assert.equal(await saveImageBatch([1], async () => false, () => {}), false);
  await assert.rejects(saveImageBatch([1, 2], async n => n === 1, () => {}), /2장 중 1장 처리 완료/);
});
