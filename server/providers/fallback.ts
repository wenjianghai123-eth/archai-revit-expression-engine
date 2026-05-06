export function isProviderFallbackEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const configured = env.ENABLE_PROVIDER_FALLBACK;
  if (configured === 'true') return true;
  if (configured === 'false') return false;
  return env.NODE_ENV !== 'production';
}
