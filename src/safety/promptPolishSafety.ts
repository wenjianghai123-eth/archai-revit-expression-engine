export interface PromptSafetyCheckResult {
  blocked: boolean;
  matchedTerms: string[];
  message: string;
}

export function checkPromptPolishSafety(_rawText: string): PromptSafetyCheckResult {
  return {
    blocked: false,
    matchedTerms: [],
    message: '',
  };
}
