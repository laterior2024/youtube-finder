/**
 * Experimental local desktop draft schema, independently implemented.
 * Field reference: GuanYixuan/pyCapCut @ ec61408d9f039c4045f946370bb35746b89b2479
 * (assets, local_materials, segment, track). No Python runtime/library is bundled.
 * This is not a supported CapCut interchange API or a mobile .capcut container.
 */
export const CAPCUT_SECONDS_PER_SLIDE = 3;
export interface CapcutScene {
  background: string;
  textLayers: string[];
}

export function createCapcutDraft(scenes: CapcutScene[], width: number, height: number) {
  if (!scenes.length) throw new Error('사진이 있는 게시물에서 캡컷 다운로드를 사용해 주세요.');
  const id = () => crypto.randomUUID().toUpperCase();
  const draftId = id();
  const name = `Instagram_${draftId.slice(0, 8)}`;
  const duration = CAPCUT_SECONDS_PER_SLIDE * 1_000_000;
  const now = Date.now() * 1000;
  const videos: Record<string, unknown>[] = [];
  const speeds: Record<string, unknown>[] = [];
  const tracks = Array.from({ length: 1 + Math.max(...scenes.map(s => s.textLayers.length)) }, (_, i) => ({
    id: id(), type: 'video', name: i === 0 ? 'Background' : `Text image ${i}`,
    attribute: 0, flag: 0, is_default_name: false,
    segments: [] as Record<string, unknown>[],
  }));
  scenes.forEach((scene, index) => {
    [scene.background, ...scene.textLayers].forEach((path, layer) => {
      if (!/^media\/\d{3}_(background|text_\d{2})\.png$/.test(path)) throw new Error('잘못된 캡컷 자료 경로입니다.');
      const materialId = id(), speedId = id();
      videos.push({
        id: materialId, material_id: materialId, local_material_id: '',
        type: 'photo', category_id: '', category_name: 'local', check_flag: 63487,
        material_name: path.split('/').pop(), path, media_path: '',
        width, height, duration: 10_800_000_000, audio_fade: null,
        crop: { upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0,
          lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1 },
        crop_ratio: 'free', crop_scale: 1,
      });
      speeds.push({ id: speedId, type: 'speed', mode: 0, speed: 1, curve_speed: null });
      tracks[layer].segments.push({
        id: id(), material_id: materialId,
        target_timerange: { start: index * duration, duration },
        source_timerange: { start: 0, duration },
        speed: 1, volume: 0, last_nonzero_volume: 1, reverse: false, visible: true,
        render_index: layer, track_render_index: 0, track_attribute: 0,
        enable_adjust: true, enable_color_correct_adjust: false, enable_color_curves: true,
        enable_color_match_adjust: false, enable_color_wheels: true, enable_lut: true,
        enable_smart_color_adjust: false,
        common_keyframes: [], keyframe_refs: [], extra_material_refs: [speedId],
        uniform_scale: { on: true, value: 1 },
        clip: { alpha: 1, flip: { horizontal: false, vertical: false }, rotation: 0,
          scale: { x: 1, y: 1 }, transform: { x: 0, y: 0 } },
        hdr_settings: { intensity: 1, mode: 1, nits: 1000 },
      });
    });
  });
  const materials: Record<string, unknown[]> = {};
  for (const key of ('ai_translates audio_balances audio_effects audio_fades audio_track_indexes audios beats canvases chromas color_curves common_mask digital_human_model_dressing digital_humans drafts effects flowers green_screens handwrites hsl images log_color_wheels loudnesses manual_beautys manual_deformations material_animations material_colors multi_language_refs placeholder_infos placeholders plugin_effects primary_color_wheels realtime_denoises shapes smart_crops smart_relights sound_channel_mappings speeds stickers tail_leaders text_templates texts time_marks transitions video_effects video_trackings videos vocal_beautifys vocal_separations').split(' ')) materials[key] = [];
  materials.videos = videos;
  materials.speeds = speeds;
  const platform = { app_id: 359289, app_source: 'cc', app_version: '6.7.0', os: 'windows' };
  const content = {
    id: draftId, name, version: 360000, new_version: '140.0.0', fps: 30,
    duration: scenes.length * duration, create_time: now, update_time: now,
    canvas_config: { width, height, ratio: 'original', background: null }, color_space: 0,
    config: { maintrack_adsorb: true, material_save_mode: 0, video_mute: false },
    materials, tracks, platform, last_modified_platform: { ...platform },
    keyframes: { adjusts: [], audios: [], effects: [], filters: [], handwrites: [], stickers: [], texts: [], videos: [] },
    keyframe_graph_list: [], relationships: [], lyrics_effects: [],
    source: 'default', path: '', cover: null, static_cover_image_path: '',
    free_render_index_mode_on: false, render_index_track_mode_on: false,
    is_drop_frame_timecode: false, group_container: null, mutable_config: null,
    retouch_cover: null, time_marks: null, extra_info: null,
  };
  const meta = {
    draft_id: draftId, draft_name: name, draft_fold_path: '', draft_root_path: '',
    draft_cover: '', draft_new_version: '', draft_type: '', draft_is_invisible: false,
    draft_is_from_deeplink: 'false', draft_is_cloud_temp_draft: false,
    cloud_draft_sync: false, cloud_draft_cover: false,
    draft_materials: [0, 1, 2, 3, 6, 7, 8].map(type => ({ type, value: [] })),
    draft_materials_copied_info: [], draft_segment_extra_info: [],
    draft_timeline_materials_size_: 0, tm_duration: content.duration,
    tm_draft_create: now, tm_draft_modified: now, tm_draft_removed: 0,
  };
  return { content, meta };
}
