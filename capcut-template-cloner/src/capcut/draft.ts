/**
 * TemplateSpec → 캡컷 PC 초안 파일들.
 *
 * 골든 파일(golden/*.json)은 0단계에서 캡컷 9.0.0.3858(Windows)로 열리는 것을 확인한
 * `틀복사_T2_틀재현` 초안의 뼈대다. 세그먼트/소재 모양도 그 초안과 똑같이 만든다.
 * 소재 경로는 T4에서 확인한 "초안 폴더 기준" 자리표시를 써서, zip을 초안 폴더에 풀기만 하면 열린다.
 */
import type { Layer, TemplateSpec, TextStyle } from '../../spec/template-spec';
import { hexToRgb01 } from '../lib/color';
import { imageScaleForRect, rectCenterTransform, strokeJsonWidth, strokeUiWidth, textSizeUnits } from '../lib/capcutMath';
import contentSkeleton from './golden/draft_content_skeleton.json';
import metaSkeleton from './golden/draft_meta_info_skeleton.json';

export const DRAFT_PATH_PLACEHOLDER = '##_draftpath_placeholder_0E685133-18CE-45ED-8CB8-2904A212EC80_##';
export const ASSET_DIR = 'tbc_assets';
export const DURATION_US = 9_000_000;
const FULL = { x: 0, y: 0, w: 1, h: 1 };

export interface DraftImage {
  /** tbc_assets 안의 파일 이름 */
  fileName: string;
  width: number;
  height: number;
  /** 놓일 위치. 없으면 캔버스 전체 */
  rect?: { x: number; y: number; w: number; h: number };
  alpha?: number;
}

export interface DraftText {
  text: string;
  rect: { x: number; y: number; w: number; h: number };
  style: TextStyle;
  startUs: number;
  durationUs: number;
  /** 같은 트랙에 올릴 글자끼리 같은 이름 (시간이 겹치면 안 됨) */
  track: string;
}

export interface DraftOptions {
  draftName: string;
  /** 사용자의 캡컷 초안 폴더 경로. 알면 메타 정보에 적는다 (0단계 초안에는 실제 경로가 들어 있었음) */
  draftsRoot?: string;
  now?: number;
}

const hex32 = () => crypto.randomUUID().replace(/-/g, '');
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** spec에서 초안에 올릴 이미지 목록 (PNG는 브라우저가 따로 그린다) */
export function imagesForSpec(spec: TemplateSpec): (DraftImage & { layer: Layer })[] {
  const { widthPx: W, heightPx: H } = spec.canvas;
  return [...spec.layers]
    .sort((a, b) => a.zIndex - b.zIndex)
    .flatMap((layer): (DraftImage & { layer: Layer })[] => {
      if (layer.kind === 'box') return [{ layer, fileName: `${layer.id}.png`, width: W, height: H }];
      if (layer.kind === 'video-area' || layer.kind === 'logo') {
        return [{
          layer, fileName: `${layer.id}.png`, rect: layer.rect,
          width: Math.max(1, Math.round(layer.rect.w * W)), height: Math.max(1, Math.round(layer.rect.h * H)),
          alpha: layer.kind === 'logo' ? layer.opacity : 1,
        }];
      }
      return [];
    });
}

export const CAPTION_SAMPLES = ['자막 예시 첫 번째 줄', '여기에 대사가 들어가요', '강조 단어는 이렇게'];

export function textsForSpec(spec: TemplateSpec): DraftText[] {
  return [...spec.layers]
    .sort((a, b) => a.zIndex - b.zIndex)
    .flatMap((layer): DraftText[] => {
      if (layer.kind === 'text-slot') {
        return [{ text: layer.sampleText, rect: layer.rect, style: layer.style, startUs: 0, durationUs: DURATION_US, track: layer.id }];
      }
      if (layer.kind === 'caption') {
        const step = Math.round(DURATION_US / CAPTION_SAMPLES.length);
        return CAPTION_SAMPLES.map((text, i) => ({ text, rect: layer.rect, style: layer.style, startUs: i * step, durationUs: step, track: layer.id }));
      }
      return [];
    });
}

export function buildDraftFiles(spec: TemplateSpec, images: DraftImage[], texts: DraftText[], opts: DraftOptions) {
  const { widthPx: W, heightPx: H } = spec.canvas;
  const content = clone(contentSkeleton) as Record<string, any>;
  const materials = content.materials as Record<string, any[]>;
  const tracks: any[] = [];

  images.forEach((img, i) => {
    const materialId = hex32();
    const speedId = hex32();
    const rect = img.rect ?? FULL;
    const t = img.rect ? rectCenterTransform(rect) : { x: 0, y: 0 };
    const scale = img.rect ? imageScaleForRect(rect, W, H, img.width, img.height) : 1;
    materials.videos.push({
      audio_fade: null, category_id: '', category_name: 'local', check_flag: 63487,
      crop: { upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0, lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1 },
      crop_ratio: 'free', crop_scale: 1, duration: 10_800_000_000, height: img.height, id: materialId,
      local_material_id: '', material_id: materialId, material_name: img.fileName, media_path: '',
      path: `${DRAFT_PATH_PLACEHOLDER}/${ASSET_DIR}/${img.fileName}`, type: 'photo', width: img.width,
    });
    materials.speeds.push({ curve_speed: null, id: speedId, mode: 0, speed: 1, type: 'speed' });
    tracks.push({
      attribute: 0, flag: 0, id: hex32(), is_default_name: false, name: `img${i}`, type: 'video',
      segments: [{
        ...segmentBase(materialId, speedId, 0, DURATION_US, img.alpha ?? 1, t, scale),
        source_timerange: { start: 0, duration: DURATION_US },
        hdr_settings: { intensity: 1, mode: 1, nits: 1000 },
        render_index: i,
      }],
    });
  });

  const textTracks = new Map<string, any>();
  for (const tx of texts) {
    let track = textTracks.get(tx.track);
    if (!track) {
      track = { attribute: 0, flag: 0, id: hex32(), is_default_name: false, name: `text${textTracks.size}`, type: 'text', segments: [] };
      textTracks.set(tx.track, track);
    }
    const materialId = hex32();
    const speedId = hex32();
    materials.texts.push(textMaterial(materialId, tx.text, tx.style, W));
    materials.speeds.push({ curve_speed: null, id: speedId, mode: 0, speed: 1, type: 'speed' });
    track.segments.push({
      ...segmentBase(materialId, speedId, tx.startUs, tx.durationUs, 1, rectCenterTransform(tx.rect), 1),
      source_timerange: null,
      render_index: 15000 + [...textTracks.keys()].indexOf(tx.track),
    });
  }
  tracks.push(...textTracks.values());

  const duration = Math.max(DURATION_US, ...texts.map((t) => t.startUs + t.durationUs));
  Object.assign(content, {
    id: crypto.randomUUID().toUpperCase(),
    fps: 30,
    duration,
    canvas_config: { width: W, height: H, ratio: 'original' },
    tracks,
  });

  const now = (opts.now ?? Date.now()) * 1000;
  const root = (opts.draftsRoot ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
  const meta = {
    ...clone(metaSkeleton),
    draft_id: crypto.randomUUID().toUpperCase(),
    draft_name: opts.draftName,
    draft_fold_path: root ? `${root}/${opts.draftName}` : '',
    draft_root_path: root,
    tm_draft_create: now,
    tm_draft_modified: now,
    tm_duration: duration,
  };

  const json = JSON.stringify(content, null, 2);
  return {
    'draft_content.json': json,
    'draft_info.json': json, // 버전에 따라 이쪽을 읽기도 함
    'draft_meta_info.json': JSON.stringify(meta, null, 2),
  };
}

function segmentBase(materialId: string, speedId: string, start: number, duration: number, alpha: number, t: { x: number; y: number }, scale: number) {
  return {
    enable_adjust: true, enable_color_correct_adjust: false, enable_color_curves: true, enable_color_match_adjust: false,
    enable_color_wheels: true, enable_lut: true, enable_smart_color_adjust: false, last_nonzero_volume: 1, reverse: false,
    track_attribute: 0, track_render_index: 0, visible: true, id: hex32(), material_id: materialId,
    target_timerange: { start, duration }, common_keyframes: [], keyframe_refs: [], speed: 1, volume: 1,
    extra_material_refs: [speedId],
    clip: { alpha, flip: { horizontal: false, vertical: false }, rotation: 0, scale: { x: scale, y: scale }, transform: { x: t.x, y: t.y } },
    uniform_scale: { on: true, value: 1 },
  };
}

function textMaterial(id: string, text: string, style: TextStyle, canvasW: number) {
  const stroke = style.stroke && style.stroke.widthPx > 0 ? style.stroke : undefined;
  const content: Record<string, any> = {
    styles: [{
      fill: { alpha: 1, content: { render_type: 'solid', solid: { alpha: 1, color: hexToRgb01(style.color) } } },
      range: [0, [...text].length],
      size: textSizeUnits(style.sizePx, canvasW),
      bold: style.font.weight >= 700,
      italic: false,
      underline: false,
      strokes: stroke ? [{ content: { solid: { alpha: 1, color: hexToRgb01(stroke.color) } }, width: strokeJsonWidth(strokeUiWidth(stroke.widthPx)) }] : [],
    }],
    text,
  };
  return {
    id,
    content: JSON.stringify(content),
    typesetting: 0,
    alignment: { left: 0, center: 1, right: 2 }[style.align],
    letter_spacing: 0,
    line_spacing: 0.02,
    line_feed: 1,
    line_max_width: 0.82,
    force_apply_line_max_width: false,
    check_flag: stroke ? 15 : 7,
    type: 'text',
    global_alpha: 1,
  };
}
