import { describe, expect, it } from 'vitest';

import { readApiErrorMessage } from './apiResponse';

describe('readApiErrorMessage error codes', () => {
  it('includes nested API error codes in displayed messages', () => {
    expect(readApiErrorMessage({
      ok: false,
      error: {
        code: 'SUPABASE_SCHEMA_MISMATCH',
        message: 'generation_jobs.mode check constraint failed',
      },
    })).toBe('SUPABASE_SCHEMA_MISMATCH: generation_jobs.mode check constraint failed');
  });
});
