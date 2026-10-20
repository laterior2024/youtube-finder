import type { AspectRatio, CountryCode, CountryResult } from '../types';
import { COUNTRIES } from './countries';
import { CANVAS_SIZES, slideToBlob } from './render';
import { finalCaption } from './gemini';
import { toSrt } from './files';
import { CAPCUT_SECONDS_PER_SLIDE, createCapcutDraft, type CapcutScene } from './capcut-draft';

export const CAPCUT_GUIDE = `캡컷 다운로드 사용 안내 (실험 기능)

이 ZIP은 PC용 캡컷 프로젝트 초안과 PC·휴대폰에서 가져올 편집 자료입니다.
캡컷에서 실제 열기 및 버전별 호환성은 아직 검증하지 않았습니다.
모바일 전용 .capcut 파일이 아니며, ZIP을 눌러 앱이 자동으로 열리지는 않습니다.

Windows PC에서 프로젝트 초안 열기
1. ZIP 전체를 원하는 폴더에 압축 해제합니다.
2. 캡컷을 종료합니다.
3. 압축을 푼 폴더에서 PowerShell을 열고 .\\install-capcut.ps1 을 실행합니다.
4. 캡컷을 다시 열고 Instagram_으로 시작하는 새 프로젝트를 확인합니다.
5. 저장 폴더를 찾지 못하면 캡컷 설정의 초안 저장 위치를 확인하고
   .\\install-capcut.ps1 -DraftRoot "확인한 초안 저장 폴더" 로 실행합니다.
스크립트는 기존 프로젝트를 덮어쓰지 않습니다. 관리자 권한이나 Python 설치는 필요 없습니다.
Windows 실행 정책에 차단되면 스크립트를 검토하고 필요한 경우 해당 파일만 차단 해제하세요.
회사·학교 보안 정책은 변경하지 마세요.

PC 초안 구성
- 화면 사진 순서, 사진당 3초, 원래 화면 비율, 30fps.
- 배경(그라데이션·어둡게 포함)과 각 글자 상자를 별도 이미지 트랙으로 배치합니다.
- 글자 모양·색을 유지하기 위해 글자는 투명 PNG입니다. 위치·크기·재생 시간 조절용입니다.
- 문구 자체를 고치려면 해당 글자 이미지 트랙을 숨기고 text/의 원문으로 새 텍스트를 넣으세요.
- 음악·음성·전환 효과는 추가하지 않습니다. 영상 원본은 포함하지 않습니다.

휴대폰 / Mac / PC 초안이 열리지 않을 때
1. ZIP을 모두 압축 해제합니다.
2. 캡컷 → 새 프로젝트 → photos/ 안의 완성 PNG를 번호 순서대로 선택합니다.
   갤러리에서 보이지 않으면 파일 앱에서 사진첩에 저장한 뒤 선택하세요.
3. 문구를 새로 편집하려면 desktop-draft/media/의 background 사진을 사용하고,
   text/의 문구를 복사해 캡컷 텍스트로 넣으세요.
4. _text_ PNG는 필요할 때 오버레이로 추가합니다. 배경과 동일한 화면 크기에 맞춥니다.
PC에서 프로젝트가 정상으로 열리면 캡컷의 계정/클라우드 동기화로 휴대폰에
이어갈 수 있는지도 확인하세요. 계정·지역·요금제·버전에 따라 다를 수 있습니다.
이 앱이 캡컷 계정에 자동 로그인하거나 업로드하지 않습니다.

파일 설명
photos/: 현재 편집 모습 그대로인 완성 사진
desktop-draft/: PC용 JSON 초안과 배경·투명 글자 이미지
text/: 장별 문구 원문
caption.txt: 최종 게시물 설명글
slides.srt: 사진당 3초 기준 문구 자막 (PC 캡컷에서 직접 가져오기)
video-subtitles.srt: 있는 경우 원본 영상 기준 자막; 사진 타임라인과 별개
timeline.json: 사진 순서·시간·레이어·문구 정보 (캡컷 전용 가져오기 파일이 아님)

앱의 전체 ZIP 다운로드·사진 저장·공유 기능은 기존과 동일합니다.
캡컷 초안은 이 앱에 다시 불러오는 백업 파일이 아닙니다.
`;

// The renderer is injectable for archive tests without a browser/canvas.
export async function buildCapcutArchive(
  input: CountryResult, country: CountryCode, aspect: AspectRatio,
  progress: (message: string) => void = () => {},
  render = slideToBlob,
  installer?: string,
): Promise<File> {
  // Freeze one coherent export even if the user edits or changes posts during rendering.
  const { slides, localization } = structuredClone(input);
  if (!slides.length) throw new Error('사진이 있는 게시물에서 캡컷 다운로드를 사용해 주세요.');
  if (slides.some(s => s.bgStatus === 'loading')) throw new Error('이미지 생성이 끝난 뒤 다운로드해 주세요.');
  if (slides.some(s => s.bgStatus === 'error' || (!s.background && ['photo', 'illustration'].includes(s.backgroundType)))) {
    throw new Error('배경이 완성되지 않은 사진이 있어요. 배경을 다시 만들거나 단색 배경으로 바꾼 뒤 내려받아 주세요.');
  }
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const scenes: CapcutScene[] = [];
  const timeline = [];
  const subtitles = [];
  const lang = COUNTRIES[country].lang;
  let bytes = 0;
  const putImage = async (path: string, blob: Blob) => {
    bytes += blob.size;
    if (bytes > 80 * 1024 * 1024) throw new Error('캡컷 자료가 80MB를 넘었어요. 사진 수를 줄여서 다시 내려받아 주세요.');
    zip.file(path, await blob.arrayBuffer(), { compression: 'STORE' });
  };
  for (const [i, slide] of slides.entries()) {
    const number = String(i + 1).padStart(3, '0');
    progress(`캡컷 자료 준비 ${i + 1}/${slides.length}`);
    const background = `media/${number}_background.png`;
    const complete = `photos/${number}.png`;
    const strict = { strictImages: true };
    await putImage(complete, await render(slide, lang, aspect, strict));
    await putImage(`desktop-draft/${background}`, await render(slide, lang, aspect, { ...strict, text: false }));
    const textLayers: string[] = [];
    const blocks = slide.textBlocks.filter(b => b.text.trim());
    for (const [j, block] of blocks.entries()) {
      const path = `media/${number}_text_${String(j + 1).padStart(2, '0')}.png`;
      await putImage(`desktop-draft/${path}`, await render({ ...slide, textBlocks: [block] }, lang, aspect, {
        background: false, effects: false, strictImages: true,
      }));
      textLayers.push(path);
    }
    const text = blocks.map(b => b.uppercase ? b.text.toUpperCase() : b.text).join('\n\n');
    zip.file(`text/${number}.txt`, text);
    const start = i * CAPCUT_SECONDS_PER_SLIDE, end = start + CAPCUT_SECONDS_PER_SLIDE;
    if (text) subtitles.push({ start, end, text: text.replace(/\n{2,}/g, '\n') });
    scenes.push({ background, textLayers });
    timeline.push({ order: i + 1, start, end, photo: complete, background: `desktop-draft/${background}`,
      textLayers: textLayers.map(path => `desktop-draft/${path}`), text });
  }
  const [width, height] = CANVAS_SIZES[aspect];
  const { content, meta } = createCapcutDraft(scenes, width, height);
  zip.file('desktop-draft/draft_content.json', JSON.stringify(content, null, 2));
  zip.file('desktop-draft/draft_meta_info.json', JSON.stringify(meta, null, 2));
  zip.file('timeline.json', JSON.stringify({ format: 'instagram-localizer-capcut-assets-v1', compatibility: 'unverified',
    width, height, fps: 30, secondsPerSlide: CAPCUT_SECONDS_PER_SLIDE, scenes: timeline }, null, 2));
  zip.file('install-capcut.ps1', installer ?? (await import('./capcut-install.ps1?raw')).default);
  zip.file('사용방법.txt', '\uFEFF' + CAPCUT_GUIDE);
  zip.file('caption.txt', finalCaption(localization));
  if (subtitles.length) zip.file('slides.srt', toSrt(subtitles));
  if (localization.videoSubtitles.length) zip.file('video-subtitles.srt', toSrt(localization.videoSubtitles));
  progress('캡컷 ZIP 압축 중…');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
  return new File([blob], `instagram_${country}_capcut.zip`, { type: 'application/zip' });
}
