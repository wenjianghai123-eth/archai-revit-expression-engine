import { GenerationStep } from '../types';

export interface SafetyPrecheckResult {
  blocked: boolean;
  matchedTerms: string[];
  message: string;
}

export interface ImageSafetyNotice {
  warningLevel: 'info' | 'caution';
  matchedTerms: string[];
  message: string;
}

interface RiskMatcher {
  label: string;
  pattern: RegExp;
}

const safeTextFragments = [
  '儿童房',
  '儿童空间',
  '儿童活动区',
  '儿童区',
  '亲子空间',
  '刀把户型',
  '刀把型户型',
  '枪灰',
  '枪灰色',
  'gunmetal',
  '无水印',
  '无 logo',
  '无Logo',
  '无LOGO',
  '无人物',
  '无人像',
  '无品牌',
  '无品牌标识',
];

const highRiskMatchers: RiskMatcher[] = [
  { label: '裸露', pattern: /裸露|裸体|nud(e|ity)/iu },
  { label: '色情', pattern: /色情|成人内容|sex(ual)?|porn/iu },
  { label: '性感', pattern: /性感|seductive|erotic/iu },
  { label: '血腥', pattern: /血腥|血迹|gore|bloody/iu },
  { label: '暴力', pattern: /暴力|殴打|violence|violent/iu },
  { label: '武器', pattern: /武器|weapon/iu },
  { label: '枪', pattern: /枪|手枪|步枪|gun|pistol|rifle/iu },
  { label: '刀', pattern: /刀|匕首|砍刀|knife|dagger/iu },
  { label: '毒品', pattern: /毒品|吸毒|drug|narcotic/iu },
  { label: '政治人物', pattern: /政治人物|政要|political figure|president|prime minister/iu },
  { label: '政治内容', pattern: /政治|politic(al)?/iu },
  { label: '儿童/未成年人', pattern: /儿童|未成年人|未成年|minor|child|kid/iu },
  { label: 'Logo/品牌标识', pattern: /logo|品牌\s*logo|品牌标识|商标|trademark|brand/iu },
  { label: '水印', pattern: /水印|watermark/iu },
  { label: '人物/人像', pattern: /人物|人像|肖像|portrait|person|people|face/iu },
  { label: '去水印', pattern: /去水印|去除水印|移除水印|remove watermark|watermark removal/iu },
  { label: '去 logo', pattern: /去\s*logo|去除\s*logo|移除\s*logo|remove logo|logo removal/iu },
  { label: '复刻/完全复制', pattern: /复刻|完全复制|一比一复制|1\s*:\s*1\s*复制|照抄|抄袭|exact replica|clone/iu },
  { label: '仿品牌/艺术家', pattern: /仿某品牌|仿某艺术家|仿[^，。,.!?；;]{1,16}(品牌|艺术家|画家|设计师)|模仿[^，。,.!?；;]{1,16}(品牌|艺术家|画家|设计师)|in the style of/iu },
  { label: '商标/版权规避', pattern: /山寨|盗版|绕过版权|侵犯版权|trademark infringement|copyright infringement/iu },
];

const imageRiskMatchers: RiskMatcher[] = [
  { label: '人物/人像', pattern: /人物|人像|肖像|portrait|person|people|face/iu },
  { label: '儿童/未成年人', pattern: /儿童|未成年人|未成年|child|kid|minor/iu },
  { label: 'logo/商标', pattern: /logo|商标|品牌|trademark|brand/iu },
  { label: '水印', pattern: /水印|watermark/iu },
  { label: '网络参考图', pattern: /网络|网图|internet|web|online/iu },
  { label: '敏感内容', pattern: /裸露|色情|血腥|暴力|武器|枪|刀|毒品|nude|porn|gore|weapon|gun|knife|drug/iu },
];

export function precheckGenerationExtraPrompt(input: {
  extraPrompt: string;
  step?: GenerationStep;
}): SafetyPrecheckResult {
  const normalized = maskSafeFragments(input.extraPrompt || '');
  const matchedTerms = uniqueStrings(
    highRiskMatchers
      .filter(matcher => matcher.pattern.test(normalized))
      .map(matcher => matcher.label),
  );

  const result: SafetyPrecheckResult = {
    blocked: matchedTerms.length > 0,
    matchedTerms,
    message: matchedTerms.length > 0
      ? `补充提示词中包含高风险表达：${matchedTerms.join('、')}。请删除或改写这些内容后再提交，避免 AI 平台安全拒绝。`
      : '',
  };

  logSafetyPrecheckResult(result, input.step);
  return result;
}

export function buildImageSafetyNotice(input: {
  imageName?: string;
  role?: 'source_scene' | 'object_reference' | 'reference_image';
}): ImageSafetyNotice | null {
  const imageName = input.imageName || '';
  const matchedTerms = uniqueStrings(
    imageRiskMatchers
      .filter(matcher => matcher.pattern.test(imageName))
      .map(matcher => matcher.label),
  );

  if (matchedTerms.length > 0) {
    return {
      warningLevel: 'caution',
      matchedTerms,
      message: `图片文件名可能包含 ${matchedTerms.join('、')}。请确保图片内容合规且有使用权；如参考图含明显 logo、水印、人像或敏感内容，请更换为无水印、无人物、无敏感内容的参考图。`,
    };
  }

  if (input.role === 'object_reference' || input.role === 'reference_image') {
    return {
      warningLevel: 'info',
      matchedTerms: [],
      message: '请确保参考图内容合规且有使用权；如图片含明显 logo、水印、人像、品牌标识或敏感内容，建议更换为无水印、无 Logo、无人物、无品牌标识的参考图后再生成。',
    };
  }

  return null;
}

export function formatSafetyRejectedMessage(): string {
  return 'AI 平台安全策略拒绝了本次生成。建议更换无水印、无 Logo、无人物、无品牌标识的参考图，或改用文字描述家具；也可以删减高风险提示词后重试。';
}

export function isSafetyRejectedText(value: string | undefined): boolean {
  if (!value) return false;
  return /safety|safe\s*ty|policy|moderation|violation|rejected|blocked|unsafe|sensitive|违规|安全策略|内容审核|拒绝/iu.test(value);
}

function maskSafeFragments(value: string): string {
  return safeTextFragments.reduce((current, fragment) => (
    current.replace(new RegExp(escapeRegExp(fragment), 'giu'), ' ')
  ), value);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function logSafetyPrecheckResult(result: SafetyPrecheckResult, step?: GenerationStep): void {
  if (!import.meta.env.DEV || !result.blocked) return;
  console.debug('[GenerationSafety] blocked extra prompt', {
    step,
    matchedTerms: result.matchedTerms,
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
