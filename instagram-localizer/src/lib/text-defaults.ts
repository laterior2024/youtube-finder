import type { TextBlock } from '../types';

export const DEFAULT_FONT = 'Pretendard Variable';
export const THUMBNAIL_YELLOW = '#ffe14d';

/** Explicit lines/sentences, never the incidental wrapping caused by a font-size change. */
export function thumbnailLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines.filter(s => s.trim()).length > 1) return lines;
  const sentences = text.match(/[^.!?。！？]+(?:[.!?。！？]+(?:[”’"']*)|$)/gu)?.map(s => s.trim()).filter(Boolean) ?? [];
  return sentences.length === 2 || sentences.length === 3 ? sentences : lines;
}

export function thumbnailColors(text: string, base: string): string[] {
  const lines = text.split('\n');
  const nonempty = lines.map((s, i) => s.trim() ? i : -1).filter(i => i >= 0);
  return lines.map((_, i) => (nonempty.length === 2 || nonempty.length === 3) && i === nonempty[1] ? THUMBNAIL_YELLOW : base);
}

/** Applied only to newly created first-slide titles, not restored user edits. */
export function thumbnailDefaults(blocks: TextBlock[]): TextBlock[] {
  const titles = blocks.filter(b => b.role === 'headline' || b.role === 'subheadline');
  const targets = titles.length ? titles : blocks.slice(0, 1);
  const entries = targets.flatMap(b => thumbnailLines(b.text).filter(s => s.trim()));
  let offset = 0;
  return blocks.map(b => {
    if (!targets.includes(b)) return b;
    const lines = thumbnailLines(b.text);
    const colors = lines.map(line => {
      if (!line.trim()) return b.color;
      const index = offset++;
      return (entries.length === 2 || entries.length === 3) && index === 1 ? THUMBNAIL_YELLOW : b.color;
    });
    return { ...b, text: lines.join('\n'), lineColors: colors, autoThumbnailColor: targets.length === 1 };
  });
}

export function editBlockText(block: TextBlock, text: string): TextBlock {
  return { ...block, text, ...(block.autoThumbnailColor ? { lineColors: thumbnailColors(text, block.color) } : {}) };
}
