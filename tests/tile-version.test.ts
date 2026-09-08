import { describe, expect, it } from 'vitest';
import type { OEMFloor, OEMRegion } from '@opendfieldmap/core';
import { appendOEMTileVersion, lookupOEMTile } from '../packages/map/src/tileVersion';

const coverage: OEMRegion['coverage'] = {
  3: { M: { 4: [1, 3, 7, 8] } },
};
const floor: OEMFloor = {
  id: 'M',
  tileTemplate: '/tiles/1_5_3/test/{z}/{x}/{y}.webp',
  tileVersions: { 3: { 4: ['a', 'b', 'c', 'd', 'e'] } },
};

describe('tile content versions', () => {
  it('aligns versions with sparse coverage ranges', () => {
    expect(lookupOEMTile(coverage, floor, 3, 2, 4)).toEqual({ covered: true, version: 'b' });
    expect(lookupOEMTile(coverage, floor, 3, 7, 4)).toEqual({ covered: true, version: 'd' });
    expect(lookupOEMTile(coverage, floor, 3, 6, 4)).toEqual({ covered: false });
  });

  it('uses a versioned cache key when available and the latest stable path otherwise', () => {
    expect(appendOEMTileVersion('/tile.webp', 'abc 123')).toBe('/tile.webp?v=abc%20123');
    expect(appendOEMTileVersion('/tile.webp?quality=90', 'abc')).toBe('/tile.webp?quality=90&v=abc');
    expect(appendOEMTileVersion('/tile.webp')).toBe('/tile.webp');
  });
});
