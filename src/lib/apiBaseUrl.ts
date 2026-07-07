export function buildApiUrl(path: string): string {
  if (/^https?:\/\//iu.test(path)) return path;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const apiBaseUrl = getConfiguredApiBaseUrl();
  if (!apiBaseUrl) {
    return normalizedPath;
  }

  let normalizedBaseUrl = apiBaseUrl.replace(/\/+$/u, '');
  if (normalizedPath.startsWith('/api/') && /\/api$/iu.test(normalizedBaseUrl)) {
    normalizedBaseUrl = normalizedBaseUrl.replace(/\/api$/iu, '');
  }
  return `${normalizedBaseUrl}${normalizedPath}`;
}

export function getConfiguredApiBaseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const trimmed = value?.trim() || '';
  return /^(undefined|null)$/iu.test(trimmed) ? '' : trimmed;
}

export function isRelativeApiPath(path: string): boolean {
  return /^\/api(?:\/|$)/u.test(path);
}
