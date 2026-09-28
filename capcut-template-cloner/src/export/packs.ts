/** 다운로드 묶음: 캡컷 초안 zip, 틀 팩 zip */
import JSZip from 'jszip';
import type { CaptionLayer, Layer, TemplateSpec, TextSlotLayer } from '../../spec/template-spec';
import { ASSET_DIR, buildDraftFiles, CAPTION_SAMPLES, imagesForSpec, textsForSpec } from '../capcut/draft';
import { rectToPx, strokeUiWidth, textSizeUnits } from '../lib/capcutMath';
import { canvasToPng, drawBox, drawContain, drawPlaceholder, makeCanvas, renderSpec } from './render';

export function draftNameFor(spec: TemplateSpec): string {
  const clean = spec.name.replace(/[\\/:*?"<>|\n\r\t]/g, ' ').trim() || '새 틀';
  return `틀복사_${clean}`;
}

/** 초안 폴더에 바로 풀 수 있는 zip. 파일은 zip 맨 위에 둔다 (zip 이름 = 초안 폴더 이름) */
export async function buildCapcutZip(spec: TemplateSpec, logo: HTMLImageElement | null, draftsRoot?: string): Promise<{ blob: Blob; name: string }> {
  const { widthPx: W, heightPx: H } = spec.canvas;
  const zip = new JSZip();
  const images = imagesForSpec(spec);
  for (const img of images) {
    const c = makeCanvas(img.width, img.height);
    const ctx = c.getContext('2d')!;
    const layer = img.layer;
    if (layer.kind === 'box') drawBox(ctx, layer, W, H);
    else if (layer.kind === 'video-area') drawPlaceholder(ctx, 0, 0, img.width, img.height, 'VIDEO', '#3A3A3A', '#9A9A9A');
    else if (layer.kind === 'logo') {
      if (logo) drawContain(ctx, logo, 0, 0, img.width, img.height);
      else drawPlaceholder(ctx, 0, 0, img.width, img.height, 'LOGO', '#FFFFFF', '#111111');
    }
    zip.file(`${ASSET_DIR}/${img.fileName}`, await canvasToPng(c));
  }
  const name = draftNameFor(spec);
  const files = buildDraftFiles(spec, images, textsForSpec(spec), { draftName: name, draftsRoot });
  for (const [path, body] of Object.entries(files)) zip.file(path, body);
  return { blob: await zip.generateAsync({ type: 'blob' }), name };
}

/** 어디서나 쓰는 틀 팩: 투명 PNG + 스타일 카드 + 샘플 자막 + template.json */
export async function buildTemplatePack(spec: TemplateSpec, logo: HTMLImageElement | null): Promise<{ blob: Blob; name: string }> {
  const { widthPx: W, heightPx: H } = spec.canvas;
  const zip = new JSZip();

  const overlay = makeCanvas(W, H);
  renderSpec(overlay.getContext('2d')!, spec, { video: 'none', text: false, logo: logo ?? 'placeholder' });
  zip.file('overlay.png', await canvasToPng(overlay));

  const withText = makeCanvas(W, H);
  renderSpec(withText.getContext('2d')!, spec, { video: 'none', text: true, logo: logo ?? 'placeholder' });
  zip.file('overlay-with-text.png', await canvasToPng(withText));

  const preview = makeCanvas(W, H);
  const pctx = preview.getContext('2d')!;
  pctx.fillStyle = '#000';
  pctx.fillRect(0, 0, W, H);
  renderSpec(pctx, spec, { logo: logo ?? 'placeholder' });
  zip.file('preview.png', await canvasToPng(preview));

  zip.file('subtitle-sample.srt', sampleSrt());
  zip.file('style-card.txt', styleCard(spec));
  zip.file('template.json', JSON.stringify(spec, null, 2));
  zip.file('how-to-use.txt', PACK_HOWTO);
  return { blob: await zip.generateAsync({ type: 'blob' }), name: `${draftNameFor(spec)}_틀팩` };
}

function sampleSrt(): string {
  const t = (s: number) => `00:00:${String(s).padStart(2, '0')},000`;
  return CAPTION_SAMPLES.map((text, i) => `${i + 1}\n${t(i * 3)} --> ${t(i * 3 + 3)}\n${text}\n`).join('\n');
}

function styleCard(spec: TemplateSpec): string {
  const { widthPx: W, heightPx: H } = spec.canvas;
  const pos = (l: Layer) => {
    const p = rectToPx(l.rect, W, H);
    return `위치 x ${p.left}px, y ${p.top}px / 크기 ${p.width}×${p.height}px (화면 대비 위 ${(l.rect.y * 100).toFixed(1)}%)`;
  };
  const text = (l: TextSlotLayer | CaptionLayer) => {
    const s = l.style;
    return [
      `  글자 크기: ${s.sizePx}px (캡컷 크기 약 ${textSizeUnits(s.sizePx, W)})`,
      `  글자 색: ${s.color}${s.highlightColor ? ` / 강조색 ${s.highlightColor}` : ''}`,
      s.stroke ? `  테두리: ${s.stroke.color}, ${s.stroke.widthPx}px (캡컷 테두리 약 ${strokeUiWidth(s.stroke.widthPx)})` : '  테두리: 없음',
      `  정렬: ${{ left: '왼쪽', center: '가운데', right: '오른쪽' }[s.align]}`,
    ].join('\n');
  };
  const lines = [`틀 이름: ${spec.name}`, `캔버스: ${W}×${H} (${spec.canvas.aspect})`, '', '색 팔레트',
    ...Object.entries(spec.palette).map(([k, v]) => `  ${k}: ${v}`), ''];
  for (const l of [...spec.layers].sort((a, b) => a.zIndex - b.zIndex)) {
    lines.push(`■ ${l.label}`, `  ${pos(l)}`);
    if (l.kind === 'box') lines.push(`  색: ${l.fill.colors.join(' → ')} (불투명도 ${Math.round(l.fill.opacity * 100)}%)${l.radiusPx ? `, 모서리 ${l.radiusPx}px` : ''}`);
    if (l.kind === 'text-slot' || l.kind === 'caption') lines.push(text(l));
    if (l.kind === 'logo') lines.push(`  불투명도: ${Math.round(l.opacity * 100)}%`);
    lines.push('');
  }
  return lines.join('\n');
}

const PACK_HOWTO = `틀 팩 사용법 (모바일 캡컷 / 다른 편집기용)

1. 캡컷에서 영상을 넣고, overlay.png 를 "오버레이"로 추가해 화면 전체 크기로 맞춰요.
   → 박스와 로고 자리가 원본 틀과 같은 위치에 깔려요.
2. 제목·자막 글자는 style-card.txt 의 색, 크기, 테두리 값을 보고 입력해요.
3. subtitle-sample.srt 는 자막 샘플이에요. 캡컷 "자막 가져오기"로 불러올 수 있어요.
4. template.json 은 틀복사 스튜디오에 다시 불러올 수 있는 원본 설정 파일이에요.

PC 캡컷을 쓰면 "캡컷 초안 zip"을 받는 게 훨씬 편해요.
`;
