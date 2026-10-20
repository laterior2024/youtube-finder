import { isAndroidApp } from './android';
import { downloadBlob } from './files';

/** Sequential rendering limits memory. Already completed files survive a later failure. */
export async function saveImageBatch<T>(items: readonly T[], save: (item: T, index: number) => Promise<boolean>, progress: (message: string) => void) {
  let completed = 0;
  for (let i = 0; i < items.length; i++) {
    progress(`사진 저장 중 ${i + 1}/${items.length}`);
    try {
      if (!await save(items[i], i)) {
        if (!completed) return false;
        throw new Error('남은 사진 저장을 취소했어요.');
      }
      completed++;
    } catch (error) {
      throw new Error(`${items.length}장 중 ${completed}장 처리 완료. ${error instanceof Error ? error.message : '저장하지 못했어요.'} 이미 저장한 사진은 유지돼요. 남은 사진은 개별 저장할 수 있어요.`);
    }
  }
  return true;
}

interface ExportDirectory {
  getDirectoryHandle(name: string, options: { create: boolean }): Promise<ExportDirectory>;
  getFileHandle(name: string, options: { create: boolean }): Promise<{ createWritable(): Promise<{ write(blob: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }> }>;
}

export async function downloadImages<T>(items: readonly T[], render: (item: T) => Promise<Blob>, name: (item: T, index: number) => string, prefix: string, progress: (message: string) => void) {
  if (isAndroidApp()) return saveImageBatch(items, async (item, i) => downloadBlob(await render(item), name(item, i)), progress);
  const picker = (window as Window & { showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<ExportDirectory> }).showDirectoryPicker;
  if (picker) {
    let parent: ExportDirectory;
    try { parent = await picker.call(window, { mode: 'readwrite' }); }
    catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return false; throw e; }
    const folder = await parent.getDirectoryHandle(`${prefix}_${Date.now()}`, { create: true });
    return saveImageBatch(items, async (item, i) => {
      const blob = await render(item);
      const stream = await (await folder.getFileHandle(name(item, i), { create: true })).createWritable();
      try { await stream.write(blob); await stream.close(); } catch (e) { await stream.abort().catch(() => {}); throw e; }
      return true;
    }, progress);
  }
  // Browsers without a directory picker may block repeated automatic downloads.
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (let i = 0; i < items.length; i++) { progress(`사진 준비 중 ${i + 1}/${items.length}`); zip.file(name(items[i], i), await (await render(items[i])).arrayBuffer()); }
  return downloadBlob(await zip.generateAsync({ type: 'blob' }), `${prefix}_photos.zip`);
}
