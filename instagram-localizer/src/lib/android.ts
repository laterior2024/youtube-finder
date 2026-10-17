type NativeReply = { id: string; status: 'ok' | 'error' | 'cancelled'; error?: string };
type Bridge = { postMessage(message: string): void; onmessage?: (event: { data: string }) => void };
declare global { interface Window { LocalizerNative?: Bridge } }
const waiting = new Map<string, { resolve(value: NativeReply): void; reject(reason: Error): void; timer: ReturnType<typeof setTimeout> }>();
let connected: Bridge | undefined;
export const isAndroidApp = () => typeof window !== 'undefined' && !!window.LocalizerNative;

function request(op: string, values: Record<string, unknown>, timeout = 30000, id = crypto.randomUUID()): Promise<NativeReply> {
  const bridge = window.LocalizerNative;
  if (!bridge) return Promise.reject(new Error('안드로이드 앱 연결을 확인해 주세요.'));
  if (connected !== bridge) {
    connected = bridge;
    bridge.onmessage = event => {
      try {
        const reply = JSON.parse(event.data) as NativeReply;
        const pending = waiting.get(reply.id);
        if (!pending) return;
        clearTimeout(pending.timer); waiting.delete(reply.id);
        if (reply.status === 'error') pending.reject(new Error(reply.error || '휴대폰에서 처리하지 못했어요.'));
        else pending.resolve(reply);
      } catch { /* Ignore malformed or unrelated messages. */ }
    };
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('응답 시간이 지났어요. 저장 화면을 닫고 다시 시도해 주세요.')); }, timeout);
    waiting.set(id, { resolve, reject, timer });
    try { bridge.postMessage(JSON.stringify({ ...values, op, id })); }
    catch { clearTimeout(timer); waiting.delete(id); reject(new Error('앱과 연결하지 못했어요. 다시 열어 주세요.')); }
  });
}

let saving = false;
/** Chunked with acknowledgements: never materialize an entire ZIP as base64. */
export async function saveAndroidBlob(blob: Blob, name: string): Promise<boolean> {
  if (saving) throw new Error('다른 파일의 저장을 먼저 마쳐 주세요.');
  if (blob.size > 256 * 1024 * 1024) throw new Error('256MB를 넘는 파일은 나라별로 나누어 저장해 주세요.');
  saving = true;
  const transfer = crypto.randomUUID();
  try {
    const begin = await request('begin', { name, size: blob.size }, 10 * 60 * 1000, transfer);
    if (begin.status === 'cancelled') return false;
    let sequence = 0;
    for (let offset = 0; offset < blob.size; offset += 48 * 1024) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + 48 * 1024).arrayBuffer());
      let raw = '';
      for (const byte of bytes) raw += String.fromCharCode(byte);
      await request('chunk', { transfer, sequence: sequence++, data: btoa(raw) });
    }
    await request('finish', { transfer });
    return true;
  } catch (error) {
    if (transfer) void request('cancel', { transfer }).catch(() => {});
    throw error;
  } finally { saving = false; }
}

export async function copyText(text: string) {
  if (isAndroidApp()) await request('copy', { text });
  else await navigator.clipboard.writeText(text);
}

/** Preserve the PKCE code until the user chooses the app that requested it. */
export function androidAuthReturn(current: string, agent: string, native: boolean): string | null {
  const url = new URL(current);
  if (native || !/Android/i.test(agent) || url.origin !== 'https://youtube-finder-dg2x.vercel.app' || !url.searchParams.get('code')) return null;
  const code = url.searchParams.get('code')!;
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(code)) return null;
  return `intent://youtube-finder-dg2x.vercel.app/?code=${encodeURIComponent(code)}#Intent;scheme=https;package=com.laterior.instagramlocalizer;end`;
}
