import type { PostJob, SharedOptions } from '../types';

/**
 * 작업 자동 저장 (브라우저 안의 IndexedDB 저장소)
 * - 창을 닫거나, 새로고침하거나, 휴대폰에서 앱을 나갔다 와도 이어서 작업할 수 있어요.
 * - 사진은 크기가 커서 따로 한 번만 저장하고, 작업 내용에는 "사진 번호"만 적어 둬요.
 *   (같은 사진을 여러 나라가 같이 써도 한 번만 저장돼요)
 * - 저장은 이 기기·이 브라우저에만 돼요. 다른 기기와는 공유되지 않아요.
 */

export interface SavedState {
  version: 1;
  savedAt: number;
  posts: PostJob[];
  options: SharedOptions;
  view: 'input' | 'result';
  activePostId: string | null;
}

export function createPersistence(memberId: string) {
const DB_NAME = 'ig-localizer:' + memberId;
const STATE_STORE = 'state';
const IMAGE_STORE = 'images';
const STATE_KEY = 'current';
const REF_PREFIX = 'idb-image:';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('이 브라우저는 자동 저장을 지원하지 않아요.'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
        if (!db.objectStoreNames.contains(IMAGE_STORE)) db.createObjectStore(IMAGE_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('저장소를 열지 못했어요.'));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('저장하지 못했어요.'));
    tx.onabort = () => reject(tx.error ?? new Error('저장이 취소됐어요.'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 이미 저장한 사진 ↔ 사진 번호 (이번에 앱을 켠 동안 기억해요)
const idByImage = new Map<string, string>();
const imageById = new Map<string, string>();
let idCounter = 0;

function imageId(dataUrl: string): string {
  let id = idByImage.get(dataUrl);
  if (!id) {
    id = `${Date.now().toString(36)}-${(idCounter++).toString(36)}-${dataUrl.length.toString(36)}`;
    idByImage.set(dataUrl, id);
    imageById.set(id, dataUrl);
  }
  return id;
}

const isImageData = (v: unknown): v is string => typeof v === 'string' && v.startsWith('data:image/') && v.length > 200;

/** 작업 내용 안의 사진(dataURL)을 사진 번호로 바꿔요. 새로 나온 사진은 따로 모아 둬요. */
function dehydrate(value: unknown, used: Set<string>): unknown {
  if (isImageData(value)) {
    const id = imageId(value);
    used.add(id);
    return REF_PREFIX + id;
  }
  if (Array.isArray(value)) return value.map((v) => dehydrate(v, used));
  if (value && typeof value === 'object' && !(value instanceof Blob)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = dehydrate(v, used);
    return out;
  }
  return value;
}

/** 사진 번호를 다시 진짜 사진으로 바꿔요. */
function hydrate(value: unknown, images: Map<string, string>): unknown {
  if (typeof value === 'string' && value.startsWith(REF_PREFIX)) return images.get(value.slice(REF_PREFIX.length)) ?? null;
  if (Array.isArray(value)) return value.map((v) => hydrate(v, images));
  if (value && typeof value === 'object' && !(value instanceof Blob)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = hydrate(v, images);
    return out;
  }
  return value;
}

let savedImageIds = new Set<string>();

// 저장이 겹치지 않게 한 번에 하나씩 차례로 해요 (겹치면 사진이 빠질 수 있어요).
let queue: Promise<unknown> = Promise.resolve();

function saveState(state: Omit<SavedState, 'version' | 'savedAt'>): Promise<number> {
  const run = queue.then(() => writeState(state));
  queue = run.catch(() => undefined);
  return run;
}

async function writeState(state: Omit<SavedState, 'version' | 'savedAt'>): Promise<number> {
  const db = await openDb();
  const used = new Set<string>();
  const savedAt = Date.now();
  const payload = dehydrate({ ...state, version: 1, savedAt }, used);

  const tx = db.transaction([STATE_STORE, IMAGE_STORE], 'readwrite');
  const images = tx.objectStore(IMAGE_STORE);
  // 새 사진만 저장하고, 더 이상 안 쓰는 사진은 지워요.
  used.forEach((id) => {
    if (!savedImageIds.has(id)) images.put(imageById.get(id)!, id);
  });
  savedImageIds.forEach((id) => {
    if (!used.has(id)) images.delete(id);
  });
  tx.objectStore(STATE_STORE).put(payload, STATE_KEY);
  await done(tx);
  for (const [id, image] of imageById) {
    if (!used.has(id)) { imageById.delete(id); idByImage.delete(image); }
  }
  savedImageIds = used;
  return savedAt;
}

async function loadState(): Promise<SavedState | null> {
  const db = await openDb();
  const tx = db.transaction([STATE_STORE, IMAGE_STORE], 'readonly');
  const raw = await request(tx.objectStore(STATE_STORE).get(STATE_KEY));
  if (!raw) return null;
  const store = tx.objectStore(IMAGE_STORE);
  const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
  const images = new Map<string, string>();
  keys.forEach((k, i) => {
    const id = String(k);
    const dataUrl = values[i] as string;
    images.set(id, dataUrl);
    idByImage.set(dataUrl, id);
    imageById.set(id, dataUrl);
  });
  savedImageIds = new Set(images.keys());
  const state = hydrate(raw, images) as SavedState;
  return state?.version === 1 && Array.isArray(state.posts) ? state : null;
}

function clearState(): Promise<void> {
  const run = queue.then(() => wipe());
  queue = run.catch(() => undefined);
  return run;
}

async function wipe(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([STATE_STORE, IMAGE_STORE], 'readwrite');
  tx.objectStore(STATE_STORE).clear();
  tx.objectStore(IMAGE_STORE).clear();
  await done(tx);
  savedImageIds = new Set();
  idByImage.clear(); imageById.clear();
}

/** 휴대폰 저장 공간이 부족할 때 브라우저가 저장 내용을 지우지 않도록 부탁해요 (지원하는 브라우저만). */
function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => undefined);
}

/**
 * 불러온 작업 정리: 창이 닫힐 때 진행 중이던 작업은 "멈춤"으로 바꿔서,
 * 다시 만들기 버튼으로 이어서 할 수 있게 해요.
 */
function reviveAfterReload(posts: PostJob[]): PostJob[] {
  return posts.map((p) => {
    const interrupted = p.status === 'running' || p.status === 'queued';
    const hasResults = Object.keys(p.results ?? {}).length > 0;
    const results = Object.fromEntries(
      Object.entries(p.results ?? {}).map(([c, r]) => [
        c,
        r && {
          ...r,
          slides: r.slides.map((s) =>
            s.bgStatus === 'loading' ? { ...s, bgStatus: 'idle' as const, bgError: '' } : s,
          ),
        },
      ]),
    ) as PostJob['results'];
    return {
      ...p,
      importing: false,
      importMessage: p.importing ? '' : p.importMessage,
      results,
      status: interrupted ? (hasResults ? 'partial' : 'error') : p.status,
      error: interrupted ? '창이 닫혀서 만들던 작업이 멈췄어요. "다시 만들기"를 눌러 이어서 만들어 주세요.' : p.error,
      log: interrupted ? [...p.log, '⏸️ 창이 닫혀서 여기서 멈췄어요. 만들다 만 배경은 "AI로 만들기"로 다시 만들 수 있어요.'] : p.log,
    };
  });
}

return { saveState, loadState, clearState, requestPersistentStorage, reviveAfterReload };
}
