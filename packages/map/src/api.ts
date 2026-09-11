import type { OEMMapAPI } from './types';

// An exhaustive surface prevents renderer fields (including Leaflet and DOM)
// from escaping through createOEM() or widget.map at runtime.
const methods: Record<Exclude<keyof OEMMapAPI, 'manifest' | 'destroyed'>, true> = {
  getState: true, update: true, getView: true, setView: true, setZoom: true, fitBounds: true,
  setRegion: true, setSubregion: true, setFloor: true, setLocale: true, getLocale: true,
  setTheme: true, setFeatures: true, getResourceState: true, retry: true, setPointFilter: true,
  getPointFilter: true, setMarkerClustering: true, setInteractionLocks: true,
  getCustomPoints: true, getCustomPoint: true, setCustomPoints: true, upsertCustomPoints: true,
  removeCustomPoints: true, loadCustomPoints: true, clearCustomPoints: true,
  getPoint: true, loadPoint: true, project: true, unproject: true, on: true, resize: true, destroy: true,
};
export function createMapAPI(instance: OEMMapAPI): OEMMapAPI {
  const api = Object.fromEntries((Object.keys(methods) as (keyof typeof methods)[])
    .map(key => [key, instance[key].bind(instance)]));
  Object.defineProperties(api, {
    manifest: { enumerable: true, get: () => instance.manifest },
    destroyed: { enumerable: true, get: () => instance.destroyed },
  });
  return Object.freeze(api) as unknown as OEMMapAPI;
}
