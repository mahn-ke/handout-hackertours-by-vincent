/**
 * Provider registry.
 *
 * Maps network IDs (e.g. 'SH', 'VRN') to provider classes and
 * exposes a factory function to instantiate them.
 */
export { AbstractProvider } from './AbstractProvider.js';
export { AbstractHafasClientInterfaceProvider } from './AbstractHafasClientInterfaceProvider.js';
export { AbstractEfaProvider } from './AbstractEfaProvider.js';
export { ShProvider } from './ShProvider.js';
export { VrnProvider } from './VrnProvider.js';

import { ShProvider } from './ShProvider.js';
import { VrnProvider } from './VrnProvider.js';

const PROVIDERS = {
  SH: () => new ShProvider(),
  VRN: () => new VrnProvider(),
};

/**
 * Create a provider instance by network ID.
 * @param {string} networkId – e.g. 'SH', 'VRN'
 * @returns {import('./AbstractProvider.js').AbstractProvider}
 */
export function createProvider(networkId) {
  const id = (networkId || '').toUpperCase();
  const factory = PROVIDERS[id];
  if (!factory) {
    const known = Object.keys(PROVIDERS).join(', ');
    throw new Error(`Unknown provider "${networkId}". Available: ${known}`);
  }
  return factory();
}

/**
 * Return the default provider (SH).
 */
export function getDefaultProvider() {
  return createProvider('SH');
}
