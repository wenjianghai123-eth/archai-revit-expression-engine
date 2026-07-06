import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(readSupabaseUrl() && readSupabaseAnonKey());
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;

  try {
    client = createClient(readSupabaseUrl(), readSupabaseAnonKey());
    return client;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[Supabase] failed to initialize browser client', error);
    }
    client = null;
    return null;
  }
}

export async function getSupabaseSession(): Promise<Session | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data } = await supabase.auth.getSession();
    return data.session;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[Supabase] failed to read session', error);
    }
    return null;
  }
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  const session = await getSupabaseSession();
  return session?.access_token ?? null;
}

function readSupabaseUrl(): string {
  const value = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const trimmed = value?.trim() || '';
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? trimmed : '';
  } catch {
    return '';
  }
}

function readSupabaseAnonKey(): string {
  const value = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return value?.trim() || '';
}
