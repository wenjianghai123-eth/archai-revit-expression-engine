import type { SelectableImageProvider } from '../types';

const storageKey = 'aiProviderSelection:v2';

interface StoredProviderSelection {
  provider: SelectableImageProvider;
  defaultProvider: SelectableImageProvider;
}

export function readSelectedImageProvider(
  defaultProvider: SelectableImageProvider,
  availableProviders: SelectableImageProvider[],
): SelectableImageProvider {
  if (typeof window === 'undefined') return defaultProvider;
  const stored = parseStoredSelection(readStorageValue(storageKey));
  if (stored && stored.defaultProvider === defaultProvider && availableProviders.includes(stored.provider)) {
    return stored.provider;
  }
  return defaultProvider;
}

export function writeSelectedImageProvider(
  provider: SelectableImageProvider,
  defaultProvider: SelectableImageProvider,
): void {
  if (typeof window === 'undefined') return;
  const value: StoredProviderSelection = { provider, defaultProvider };
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Provider preference should never block app startup or generation.
  }
}

export function isSelectableImageProvider(value: unknown): value is SelectableImageProvider {
  return value === 'grsai-banana2' || value === 'apiyi-nano-banana2-edit';
}

function parseStoredSelection(value: string | null): StoredProviderSelection | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredProviderSelection>;
    if (!isSelectableImageProvider(parsed.provider) || !isSelectableImageProvider(parsed.defaultProvider)) return null;
    return { provider: parsed.provider, defaultProvider: parsed.defaultProvider };
  } catch {
    return null;
  }
}

function readStorageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
