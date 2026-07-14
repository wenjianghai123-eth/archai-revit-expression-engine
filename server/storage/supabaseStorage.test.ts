import { describe, expect, it } from 'vitest';

import { createSupabaseStorageError } from './supabaseStorage';

describe('createSupabaseStorageError', () => {
  it('maps check constraint failures to schema mismatch errors', () => {
    const error = createSupabaseStorageError({
      code: '23514',
      message: 'new row for relation "generation_jobs" violates check constraint "generation_jobs_mode_check"',
    }, 'creating generation job');

    expect(error.code).toBe('SUPABASE_SCHEMA_MISMATCH');
    expect(error.message).toContain('generation_jobs_mode_check');
    expect(error.message).toContain('docs/SUPABASE_SETUP.md');
  });

  it('maps missing column failures to schema mismatch errors', () => {
    const error = createSupabaseStorageError({
      code: 'PGRST204',
      message: "Could not find the 'output_asset_ids' column of 'generation_jobs' in the schema cache",
    }, 'creating generation job');

    expect(error.code).toBe('SUPABASE_SCHEMA_MISMATCH');
    expect(error.message).toContain('output_asset_ids');
  });

  it('maps missing floor plan tables to a schema readiness error, not a storage error', () => {
    const error = createSupabaseStorageError({
      code: 'PGRST205',
      message: "Could not find the table 'public.floor_plan_region_sets' in the schema cache",
    }, 'creating floor plan region set');

    expect(error.code).toBe('FLOOR_PLAN_SCHEMA_NOT_READY');
    expect(error.message).toContain('20260714005000_repair_floor_plan_schema.sql');
    expect(error.message).toContain('Supabase database error');
    expect(error.message).not.toContain('Supabase storage error');
  });

  it('maps missing credit RPC function failures to credit RPC missing errors', () => {
    const error = createSupabaseStorageError({
      code: 'PGRST202',
      message: 'Could not find the function public.adjust_credits_atomic in the schema cache',
    }, 'adjusting credits atomically');

    expect(error.code).toBe('CREDIT_RPC_MISSING');
    expect(error.message).toContain('adjust_credits_atomic');
    expect(error.message).toContain('service_role');
  });

  it('maps non-schema generation job insert failures to create job errors', () => {
    const error = createSupabaseStorageError({
      code: 'XX000',
      message: 'database temporarily unavailable',
    }, 'creating generation job');

    expect(error.code).toBe('GENERATION_JOB_CREATE_FAILED');
    expect(error.message).toContain('Generation job persistence failed');
  });
});
