import { describe, expect, it } from 'vitest';
import { clusterPositions } from '../packages/map/src/atlos/canvas/spatialClusters';

describe('built-in spatial clustering', () => {
  it('groups across cell boundaries and preserves authored positions', () => {
    const points = [{ item: 'a', x: -1, y: 0 }, { item: 'b', x: 1, y: 0 }, { item: 'c', x: 100, y: 0 }];
    const before = structuredClone(points);
    const groups = clusterPositions(points, 1, 60);
    expect(groups.map(group => group.members)).toEqual([['a', 'b'], ['c']]);
    expect(groups[0].x).toBe(0);
    expect(points).toEqual(before);
  });
  it('keeps every colocated member without fabricating spread positions', () => {
    const points = Array.from({ length: 1000 }, (_, item) => ({ item, x: 10, y: -20 }));
    const groups = clusterPositions(points, 2, 60);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(1000);
    expect([groups[0].x, groups[0].y]).toEqual([10, -20]);
  });
  it('splits at finer scales without losing members and is deterministic', () => {
    const points = Array.from({ length: 500 }, (_, item) => ({ item, x: (item % 25) * 10, y: Math.floor(item / 25) * 10 }));
    const coarse = clusterPositions(points, 1, 60), fine = clusterPositions(points, 4, 60);
    expect(fine.length).toBeGreaterThan(coarse.length);
    expect(new Set(fine.flatMap(group => group.members)).size).toBe(points.length);
    expect(fine).toEqual(clusterPositions(points, 4, 60));
  });
});
