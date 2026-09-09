import { loadOEMManifest, validateOEMManifest } from '@opendfieldmap/core';
import type { OEM, OEMOptions } from './types';
export type * from './types';
export { gameToOEMPosition, gameXZToOEMPosition, mapToGameXZPosition, oemToGamePosition, toOEMMapPosition, fromOEMMapPosition, toOEMLeafletMapPosition } from '@opendfieldmap/core';
export type { OEMGamePosition, OEMGameTransform, OEMGameXZPosition, OEMMapPosition } from '@opendfieldmap/core';

type OEMRuntime = typeof import('./runtime');
let runtimePromise: Promise<OEMRuntime> | undefined;
const loadRuntime = (): Promise<OEMRuntime> => runtimePromise ??= import('./runtime');

if (typeof document !== 'undefined') void loadRuntime();

/** Creates the framework-agnostic OEM rendering kernel in a browser. */
export async function createOEM(container: string | HTMLElement, options: OEMOptions): Promise<OEM> {
  if (typeof document === 'undefined') throw new Error('createOEM must run in a browser');
  if (options.customPoints !== undefined && options.customPointsUrl !== undefined) {
    throw new Error('Pass either customPoints or customPointsUrl, not both');
  }
  options.signal?.throwIfAborted();
  const element = typeof container === 'string' ? document.querySelector<HTMLElement>(container) : container;
  if (!element) throw new Error(`OEM container not found: ${container}`);
  const [manifest, { OEM: OEMClass }] = await Promise.all([
    options.manifest ? validateOEMManifest(options.manifest) : loadOEMManifest(options.resources, options.signal),
    loadRuntime(),
  ]);
  options.signal?.throwIfAborted();
  const instance = new OEMClass(element, manifest, options);
  try {
    await instance.setFeatures(options.features ?? {});
    if (options.customPointsUrl !== undefined) await instance.loadCustomPoints(options.customPointsUrl);
    options.signal?.throwIfAborted();
    return instance;
  } catch (error) {
    instance.destroy();
    throw error;
  }
}
