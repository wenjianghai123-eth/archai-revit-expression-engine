import { describe, expect, it } from 'vitest';

import { readApiErrorMessage } from './apiResponse';

describe('readApiErrorMessage error codes', () => {
  it('hides Supabase schema mismatch details from displayed messages', () => {
    expect(readApiErrorMessage({
      ok: false,
      error: {
        code: 'SUPABASE_SCHEMA_MISMATCH',
        message: "Could not find the table 'public.project_design_workflows' in the schema cache",
        hint: 'Apply the upgrade SQL in docs/SUPABASE_SETUP.md.',
      },
    })).toBe('当前服务暂时不可用，请稍后重试。');
  });

  it('hides PGRST205 details from displayed messages', () => {
    expect(readApiErrorMessage({
      ok: false,
      error: {
        code: 'PGRST205',
        message: "Could not find the table 'public.project_design_workflows' in the schema cache",
      },
    })).toBe('当前服务暂时不可用，请稍后重试。');
  });
});
