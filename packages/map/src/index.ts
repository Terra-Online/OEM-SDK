import { loadOEMManifest, validateOEMManifest } from '@opendfieldmap/core';
import type { OEM, OEMOptions } from './types';
export type * from './types';

/** Creates the framework-agnostic OEM rendering kernel in a browser. */
export async function createOEM(container: string | HTMLElement, options: OEMOptions): Promise<OEM> {
  if (typeof document === 'undefined') throw new Error('createOEM must run in a browser');
  options.signal?.throwIfAborted();
  const element = typeof container === 'string' ? document.querySelector<HTMLElement>(container) : container;
  if (!element) throw new Error(`OEM container not found: ${container}`);
  const manifest = options.manifest ? validateOEMManifest(options.manifest) : await loadOEMManifest(options.resources, options.signal);
  const { OEM: OEMClass } = await import('./runtime');
  options.signal?.throwIfAborted();
  const instance = new OEMClass(element, manifest, options);
  try {
    await instance.setFeatures(options.features ?? {});
    options.signal?.throwIfAborted();
    return instance;
  } catch (error) {
    instance.destroy();
    throw error;
  }
}
