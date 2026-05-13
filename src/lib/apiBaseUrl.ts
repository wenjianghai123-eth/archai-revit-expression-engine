export function buildApiUrl(path: string): string {
  if (/^https?:\/\//iu.test(path)) return path;

  const apiBaseUrl = getConfiguredApiBaseUrl();
  if (!apiBaseUrl || apiBaseUrl.trim().length === 0) {
    return path;
  }

  const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/u, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

export function getConfiguredApiBaseUrl(): string | undefined {
  return import.meta.env.VITE_API_BASE_URL as string | undefined;
}

export function isApiBaseUrlMissingInProduction(): boolean {
  return import.meta.env.PROD && !getConfiguredApiBaseUrl()?.trim();
}

export function isRelativeApiPath(path: string): boolean {
  return /^\/api(?:\/|$)/u.test(path);
}
