// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import L from 'leaflet';
import { decodeOEMBehaviors, findOEMBehaviors, validateOEMManifest } from '@opendfieldmap/core';
import { emptyBehaviorScene, renderRecord } from '../packages/map/src/atlos/behavior/behaviorScene';
import {
  buildProjectedCurves,
  cubicBetween,
  cubicTAtLength,
} from '../packages/map/src/atlos/behavior/cubicSpline';
import { behaviorCatalog, behaviorRows, behaviorManifest } from './behavior-fixtures';

describe('authored behavior data', () => {
  it('decodes every family without rescaling or swapping coordinates', () => {
    const records = decodeOEMBehaviors(behaviorRows(), behaviorCatalog());
    expect(records.map((record) => record.kind)).toEqual([
      'relation',
      'butterfly-path',
      'unlock-group',
      'trajectory',
    ]);
    expect(records[0]).toEqual({
      kind: 'relation',
      anchorId: '1',
      targetId: '2',
      anchorPos: [500, 400],
      targetPos: [520, 440],
    });
    expect(records[2]).toMatchObject({
      anchorId: '3',
      helpers: [{ pos: [515, 435] }, { pos: [520, 430] }, { pos: [515, 425] }],
    });
    expect(records[3]).toMatchObject({
      anchorId: '4',
      closed: true,
      points: [
        [490, 410],
        [500, 420],
        [510, 410],
        [500, 400],
      ],
    });
  });
  it('keeps branch fan-outs concurrent and collinear travel serial', () => {
    const route = decodeOEMBehaviors(behaviorRows(), behaviorCatalog())[1];
    if (route.kind !== 'butterfly-path') throw new Error('Expected a butterfly route');
    expect(route.segments.map((segment) => segment.points)).toEqual([
      [
        [500, 400],
        [500, 405],
      ],
      [
        [500, 405],
        [505, 410],
      ],
      [
        [505, 410],
        [510, 415],
      ],
      [
        [510, 415],
        [512, 420],
      ],
      [
        [512, 420],
        [515, 420],
      ],
      [
        [512, 420],
        [510, 425],
      ],
      [
        [512, 420],
        [520, 440],
      ],
    ]);
    const scene = emptyBehaviorScene();
    renderRecord(scene, route, '1');
    expect(scene.lines[1].points).toEqual([
      [500, 405],
      [505, 410],
      [510, 415],
    ]);
    expect(scene.lines[3].delay).toBe(scene.lines[4].delay);
    expect(scene.lines[5].delay).toBeGreaterThan(scene.lines[4].delay);
    expect(scene.circles).toHaveLength(6);
  });
  it('retains independent multiline entries and omits zero-length segments', () => {
    const [route] = decodeOEMBehaviors(
      [
        [
          'b',
          '1',
          [0, 0],
          null,
          [
            [
              2,
              [
                [
                  [0, 0],
                  [1, 2],
                ],
                [
                  [3, 4],
                  [5, 6],
                ],
              ],
            ],
          ],
        ],
      ],
      behaviorCatalog(),
    );
    if (route.kind !== 'butterfly-path') throw new Error('Expected a butterfly route');
    expect(route.stages[0].lineGroups).toHaveLength(2);
    expect(route.segments.map((segment) => [segment.phase, segment.points])).toEqual([
      [
        'group-members',
        [
          [0, 0],
          [1, 2],
        ],
      ],
      [
        'group-entry',
        [
          [1, 2],
          [3, 4],
        ],
      ],
      [
        'group-members',
        [
          [3, 4],
          [5, 6],
        ],
      ],
    ]);
  });
  it('finds a complete route from either endpoint without duplicating it', () => {
    const records = decodeOEMBehaviors(behaviorRows(), behaviorCatalog());
    expect(findOEMBehaviors(records, '1')).toEqual(records.slice(0, 2));
    expect(findOEMBehaviors(records, '2')).toEqual(records.slice(0, 2));
    expect(findOEMBehaviors(records, 'missing')).toEqual([]);
    const scene = emptyBehaviorScene();
    renderRecord(scene, records[0], '2');
    expect(scene.circles[0].point).toEqual([500, 400]);
  });
  it.each([
    [
      't',
      1,
      [
        [0, 0],
        [1, Infinity],
      ],
      false,
    ],
    ['t', 1, [[0, 0]], false],
    [
      't',
      1,
      [
        [0, 0],
        [1, 1],
      ],
      1,
    ],
    ['r', NaN, 2, [0, 0], [1, 1]],
    ['r', '', 2, [0, 0], [1, 1]],
    ['r', 1, 2, [0, '1'], [1, 1]],
    ['u', 1, [0, 0], [[1, 1]]],
    ['b', 1, [0, 0], null, [[1, [[1, 1]]]]],
    [
      'b',
      1,
      [0, 0],
      null,
      [
        [
          2,
          [
            [
              [1, 1],
              [2, 2],
            ],
          ],
        ],
      ],
    ],
    ['b', 1, [0, 0], null, [[9, [[1, 1]]]]],
    ['unknown', 1],
  ])('rejects a malformed record rather than dropping part of a route: %j', (...row) => {
    expect(() => decodeOEMBehaviors([row], behaviorCatalog())).toThrow('behaviors[0]');
  });
  it('requires the declared encoding, version and unambiguous layout', () => {
    const catalog = behaviorCatalog();
    expect(() => decodeOEMBehaviors([], { ...catalog, encoding: 'future' })).toThrow('behaviors.encoding');
    expect(() => decodeOEMBehaviors([], { ...catalog, schemaVersion: 7 })).toThrow('behaviors.encoding');
    catalog.layout.records.relation = catalog.layout.records.trajectory;
    expect(() => decodeOEMBehaviors([], catalog)).toThrow('behaviors.layout');
    expect(() => decodeOEMBehaviors({}, behaviorCatalog())).toThrow('record array');
  });
  it('validates optional manifest references while accepting older manifests', () => {
    const manifest = behaviorManifest();
    expect(validateOEMManifest(manifest)).toBe(manifest);
    delete manifest.behaviors;
    expect(validateOEMManifest(manifest)).toBe(manifest);
    manifest.behaviors = behaviorCatalog();
    manifest.behaviors.files.UNKNOWN = manifest.behaviors.files.VL_1;
    expect(() => validateOEMManifest(manifest)).toThrow('manifest.behaviors.files.UNKNOWN');
  });
});

describe('trajectory interpolation', () => {
  it.each([false, true])('interpolates every knot with a smooth %s seam', (closed) => {
    const points = [L.point(0, 0), L.point(10, 15), L.point(20, 0), L.point(10, -5)];
    const curves = buildProjectedCurves(points, closed);
    expect(curves).toHaveLength(closed ? 4 : 3);
    curves.forEach((curve, index) => {
      expect(curve.p0).toEqual(points[index]);
      expect(curve.p3).toEqual(points[(index + 1) % points.length]);
      const next = curves[(index + 1) % curves.length];
      if (!closed && index === curves.length - 1) return;
      for (const key of ['x', 'y'] as const) {
        expect(curve.p3[key] - curve.p2[key]).toBeCloseTo(next.p1[key] - next.p0[key], 9);
        expect(curve.p3[key] - 2 * curve.p2[key] + curve.p1[key]).toBeCloseTo(
          next.p2[key] - 2 * next.p1[key] + next.p0[key],
          9,
        );
      }
    });
    const curve = curves[0];
    const half = cubicTAtLength(curve, curve.length / 2);
    const clipped = cubicBetween(curve, 0, half);
    expect(clipped.p0).toEqual(points[0]);
    expect(clipped.p3.distanceTo(points[0])).toBeGreaterThan(0);
    expect(cubicTAtLength(curve, -1)).toBe(0);
    expect(cubicTAtLength(curve, Infinity)).toBe(1);
  });
  it('handles repeated knots and the two-knot closed route without non-finite control points', () => {
    const curves = buildProjectedCurves([L.point(0, 0), L.point(0, 0), L.point(10, 5), L.point(0, 0)], true);
    expect(curves).toHaveLength(2);
    expect(
      curves.every((curve) =>
        [curve.p0, curve.p1, curve.p2, curve.p3].every(
          (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
        ),
      ),
    ).toBe(true);
    expect(buildProjectedCurves([L.point(0, 0), L.point(0, 0)], false)).toEqual([]);
  });
});
