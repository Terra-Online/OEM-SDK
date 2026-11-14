import rows from './fixtures/behavior.json';
import type { OEMBehaviorCatalog } from '@opendfieldmap/core';
import { createManifest } from './fixtures';

export const behaviorCatalog = (): OEMBehaviorCatalog => ({
  schemaVersion: 6,
  encoding: 'tuple-v1',
  layout: {
    records: { relation: 'r', butterflyPath: 'b', unlockGroup: 'u', trajectory: 't' },
    stageModes: { collinear: 0, branch: 1, multiline: 2 },
  },
  files: {
    VL_1: { path: '/behavior/VL_1.json', sha256: 'hash', bytes: 2 },
    VL_2: { path: '/behavior/VL_2.json', sha256: 'hash', bytes: 2 },
    WL_1: { path: '/behavior/WL_1.json', sha256: 'hash', bytes: 2 },
  },
  unlockIcon: '/bubble.svg',
});

// All coordinates are normalized [z, x], deliberately asymmetric to catch swaps.
export const behaviorRows = () => structuredClone(rows);

export const behaviorManifest = () => {
  const manifest = createManifest();
  manifest.behaviors = behaviorCatalog();
  manifest.regions[0].subregions.push({ id: 'VL_2', key: 'second' });
  manifest.regions[0].points.push({ path: '/VL_2.json', sha256: 'hash', bytes: 2 });
  manifest.regions.push({
    ...manifest.regions[0],
    id: 'Wuling',
    initialView: { ...manifest.regions[0].initialView, regionId: 'Wuling' },
    subregions: [{ id: 'WL_1', key: 'other' }],
    points: [{ path: '/WL_1.json', sha256: 'hash', bytes: 2 }],
  });
  return manifest;
};
