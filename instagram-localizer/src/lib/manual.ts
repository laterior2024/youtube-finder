import type { CountryCode, CountryResult, PostInput, TextBlock } from '../types';
import { defaultFontFor, COUNTRIES } from './countries';
import { defaultGradient } from './gradient';

export function manualResult(input: PostInput, country: CountryCode): CountryResult {
  const title: TextBlock = {
    id: 'manual-title', role: 'headline', text: '여기에 제목을 입력하세요', originalText: '',
    x: 8, y: 65, w: 84, h: 24, fontStyle: 'sans', fontFamily: defaultFontFor(COUNTRIES[country].lang, 'sans'),
    fontWeight: 700, fontSizePct: 5.5, color: '#ffffff', align: 'left', lineHeight: 1.25,
    italic: false, uppercase: false, strokeColor: '', shadow: true, highlightColor: '',
  };
  const images = input.images.length ? input.images : [null];
  return {
    localization: {
      country, caption: input.caption, hashtags: [], hashtagReasons: [], captionCheck: [], ctaComment: '', ctaShare: '',
      ctaCommentOptions: [], ctaShareOptions: [], creditLine: input.credit ? `출처: ${input.credit}` : '', seoKeywords: [],
      commentKeyword: '', altTexts: [], hookAlternatives: [], postingTip: '', culturalNotes: [], slides: [], videoSubtitles: [], videoScenePrompts: [],
    },
    slides: images.map((img, index) => ({
      index, backgroundType: img ? 'photo' : 'solid', backgroundColors: ['#28253a'],
      textBlocks: [{ ...title, id: `manual-title-${index}` }], imagePrompt: '', sourceImage: img?.dataUrl ?? null,
      background: img?.dataUrl ?? null, bgStatus: 'done', bgError: '', bgSource: img ? 'upload' : undefined,
      overlay: 0, gradient: defaultGradient(img ? 'photo' : 'solid'),
    })),
  };
}
