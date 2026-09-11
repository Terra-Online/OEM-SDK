import { describe, expect, it } from 'vitest';
import { parseBoundaryCollection } from '../packages/map/src/runtime/geometry';

const boundary = {
  id: 'area',
  rings: [[{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 0, z: 1 }]],
};

describe('boundary collection protocol', () => {
  it('reads the shared counted collection format', () => {
    expect(parseBoundaryCollection({ count: 1, boundaries: [boundary] }, '/boundaries/test.json'))
      .toEqual([boundary]);
  });

  it('keeps immutable legacy boundary arrays readable', () => {
    expect(parseBoundaryCollection([boundary], '/boundaries/legacy.json')).toEqual([boundary]);
  });

  it('rejects a collection whose count does not match its boundaries', () => {
    expect(() => parseBoundaryCollection({ count: 2, boundaries: [boundary] }, '/boundaries/bad.json'))
      .toThrow('Invalid OEM boundary data');
  });
});
