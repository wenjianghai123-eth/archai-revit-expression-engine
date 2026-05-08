import { createGrsaiBanana2Provider } from './grsaiBanana2Provider';

interface GrsaiProviderOptions {
  apiKey?: string;
}

export function createGrsaiNanoBananaProvider(options: GrsaiProviderOptions = {}) {
  return createGrsaiBanana2Provider({ ...options, name: 'grsai-nano-banana' });
}
