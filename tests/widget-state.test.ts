import { describe, expect, it } from 'vitest';
import { parseOEMUrlState } from '@opendfieldmap/sdk';

describe('widget URL state', () => {
  it('uses Atlos-compatible routing keys plus widget view keys', () => {
    expect(parseOEMUrlState('?r=WL&f=crate_i,aurylene&s=WL_1&l=zh-CN&layer=B2&z=2.5&cx=3200&cz=4100&labels=1&boundaries=1&cluster=0')).toEqual({
      region: 'WL',
      floor: 'B2',
      locale: 'zh-CN',
      markerTypes: ['crate_i', 'aurylene'],
      subregion: 'WL_1',
      labels: true,
      boundaries: true,
      markerClustering: false,
      zoom: 2.5,
      center: { x: 3200, z: 4100 },
    });
  });

  it('supports all markers and explicit label hiding', () => {
    expect(parseOEMUrlState('https://wiki.example/map?r=VL&f=*&labels=0')).toMatchObject({
      region: 'VL', markerTypes: '*', labels: false,
    });
  });

  it('deduplicates marker types from URL input', () => {
    expect(parseOEMUrlState('?f=crate_i,crate_i,aurylene').markerTypes).toEqual(['crate_i', 'aurylene']);
  });

  it('leaves omitted URL values unresolved', () => {
    expect(parseOEMUrlState('?r=WL')).toMatchObject({
      region: 'WL', subregion: null, boundaries: undefined, markerClustering: undefined,
    });
  });
});
