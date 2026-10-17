import test from 'node:test';
import assert from 'node:assert/strict';
import { androidAuthReturn, saveAndroidBlob, copyText } from '../src/lib/android';

test('Android auth return preserves PKCE code only for exact production origin', () => {
  const url = 'https://youtube-finder-dg2x.vercel.app/?code=one-use-code';
  assert.match(androidAuthReturn(url, 'Android', false)!, /code=one-use-code#Intent;scheme=https;package=com\.laterior\.instagramlocalizer;end$/);
  assert.equal(androidAuthReturn(url, 'Android', true), null);
  assert.equal(androidAuthReturn(url, 'Windows', false), null);
  assert.equal(androidAuthReturn(url.replace('.app/', '.app.evil.test/'), 'Android', false), null);
  assert.equal(androidAuthReturn(url + '%23Intent', 'Android', false), null);
});

test('Android file transfer is bounded, ordered, exact and reports cancellation/failure', async () => {
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const messages: any[] = [];
  let mode = 'ok';
  const bridge = {
    onmessage: undefined as undefined | ((e: {data: string}) => void),
    postMessage(raw: string) {
      const data = JSON.parse(raw); messages.push(data);
      queueMicrotask(() => bridge.onmessage?.({ data: JSON.stringify({ id: data.id, status: mode === 'cancel' && data.op === 'begin' ? 'cancelled' : mode === 'fail' && data.op === 'chunk' ? 'error' : 'ok', error: 'storage full' }) }));
    },
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { LocalizerNative: bridge } });
  try {
    const bytes = Uint8Array.from({ length: 130000 }, (_, i) => i % 256);
    assert.equal(await saveAndroidBlob(new Blob([bytes]), '한국.zip'), true);
    const chunks = messages.filter(m => m.op === 'chunk');
    assert.deepEqual(chunks.map(m => m.sequence), [0,1,2]);
    assert.ok(chunks.every(m => m.data.length <= 65536));
    assert.deepEqual(Buffer.concat(chunks.map(m => Buffer.from(m.data, 'base64'))), Buffer.from(bytes));
    assert.equal(messages.at(-1).op, 'finish');
    assert.ok(chunks.every(m => m.transfer === messages[0].id));
    await copyText('한국어 caption'); assert.equal(messages.at(-1).op, 'copy');
    messages.length = 0; mode = 'cancel';
    assert.equal(await saveAndroidBlob(new Blob(['x']), 'x.png'), false);
    assert.deepEqual(messages.map(m => m.op), ['begin']);
    messages.length = 0; mode = 'fail';
    await assert.rejects(saveAndroidBlob(new Blob(['x']), 'x.png'), /storage full/);
    assert.deepEqual(messages.map(m => m.op), ['begin','chunk','cancel']);
    mode = 'ok';
    const first = saveAndroidBlob(new Blob(['x']), 'x.png');
    await assert.rejects(saveAndroidBlob(new Blob(['y']), 'y.png'), /먼저/);
    await first;
  } finally {
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
