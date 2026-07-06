export function buildApiUrl(path: string): string {
  if (/^https?:\/\//iu.test(path)) return path;

  const apiBaseUrl = getConfiguredApiBaseUrl();
  if (!apiBaseUrl) {
    return path;
  }

  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/u, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

export function getConfiguredApiBaseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return value?.trim() || '';
}

export function isRelativeApiPath(path: string): boolean {
  return /^\/api(?:\/|$)/u.test(path);
}
