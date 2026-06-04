export interface PromptSafetyCheckResult {
  blocked: boolean;
  matchedTerms: string[];
  message: string;
}

interface RiskMatcher {
  label: string;
  pattern: RegExp;
}

const safeFragments = [
  '儿童房',
  '儿童空间',
  '儿童活动区',
  '亲子空间',
  '无水印',
  '无 logo',
  '无 Logo',
  '无 LOGO',
  '无人物',
  '无人像',
  '无品牌',
  '无品牌标识',
  '枪灰',
  '枪灰色',
  'gunmetal',
  '刀把户型',
  '刀把型户型',
];

const highRiskMatchers: RiskMatcher[] = [
  { label: '裸露', pattern: /裸露|裸体|nude|nudity/iu },
  { label: '色情', pattern: /色情|成人内容|sex(ual)?|porn/iu },
  { label: '性感', pattern: /性感|seductive|erotic/iu },
  { label: '血腥', pattern: /血腥|血液|gore|bloody/iu },
  { label: '暴力', pattern: /暴力|殴打|violence|violent/iu },
  { label: '武器', pattern: /武器|weapon/iu },
  { label: '枪', pattern: /枪|手枪|步枪|gun|pistol|rifle/iu },
  { label: '刀', pattern: /刀|匕首|砍刀|knife|dagger/iu },
  { label: '毒品', pattern: /毒品|吸毒|drug|narcotic/iu },
  { label: '政治人物', pattern: /政治人物|政要|president|prime minister|political figure/iu },
  { label: '儿童/未成年人', pattern: /儿童|未成年人|未成年|child|kid|minor/iu },
  { label: '去水印', pattern: /去水印|去除水印|移除水印|remove watermark|watermark removal/iu },
  { label: '去 logo', pattern: /去\s*logo|去除\s*logo|移除\s*logo|remove logo|logo removal/iu },
  { label: '复刻/完全复制', pattern: /复刻|完全复制|一比一复制|照抄|原样复制|原样粘贴|exact replica|clone/iu },
  { label: '品牌/商标', pattern: /仿某品牌|品牌\s*logo|品牌标识|商标|trademark|in the style of/iu },
  { label: '仿艺术家', pattern: /仿某艺术家|仿某画家|模仿.*艺术家|模仿.*画家/iu },
];

export function checkPromptPolishSafety(rawText: string): PromptSafetyCheckResult {
  const normalized = maskSafeFragments(rawText || '');
  const matchedTerms = uniqueStrings(
    highRiskMatchers
      .filter(matcher => matcher.pattern.test(normalized))
      .map(matcher => matcher.label),
  );

  return {
    blocked: matchedTerms.length > 0,
    matchedTerms,
    message: matchedTerms.length > 0
      ? `语音提示中包含高风险表达：${matchedTerms.join('、')}。请删除或改写后再润色，避免 AI 平台安全拒绝。`
      : '',
  };
}

function maskSafeFragments(value: string): string {
  return safeFragments.reduce((current, fragment) => (
    current.replace(new RegExp(escapeRegExp(fragment), 'giu'), ' ')
  ), value);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
