export function buildApiUrl(path: string): string {
  if (/^https?:\/\//iu.test(path)) return path;

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!apiBaseUrl || apiBaseUrl.trim().length === 0) {
    return path;
  }

  const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/u, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}
