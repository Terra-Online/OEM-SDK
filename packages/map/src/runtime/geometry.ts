import type { OEMBoundary } from '@opendfieldmap/core';

export type GeometryPoint = { x: number; z: number };

const pointOnSegment = (point: GeometryPoint, start: GeometryPoint, end: GeometryPoint): boolean => {
  const cross = (point.x - start.x) * (end.z - start.z) - (point.z - start.z) * (end.x - start.x);
  if (Math.abs(cross) > 1e-7) return false;
  return point.x >= Math.min(start.x, end.x) - 1e-7 && point.x <= Math.max(start.x, end.x) + 1e-7 &&
    point.z >= Math.min(start.z, end.z) - 1e-7 && point.z <= Math.max(start.z, end.z) + 1e-7;
};

const pointInRing = (point: GeometryPoint, ring: readonly GeometryPoint[]): boolean => {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index];
    const prior = ring[previous];
    if (pointOnSegment(point, prior, current)) return true;
    const crosses = (current.z > point.z) !== (prior.z > point.z);
    if (crosses && point.x < (prior.x - current.x) * (point.z - current.z) / (prior.z - current.z) + current.x) inside = !inside;
  }
  return inside;
};

const distanceSquaredToSegment = (point: GeometryPoint, start: GeometryPoint, end: GeometryPoint): number => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (!lengthSquared) return (point.x - start.x) ** 2 + (point.z - start.z) ** 2;
  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  const nearestX = start.x + projection * dx;
  const nearestZ = start.z + projection * dz;
  return (point.x - nearestX) ** 2 + (point.z - nearestZ) ** 2;
};

/** Scores a boundary for hit-testing, including polygon holes and edge distance. */
export const boundaryScore = (boundary: OEMBoundary, point: GeometryPoint): { id: string; inside: boolean; distance: number } => {
  const rings = boundary.rings.map((ring) => ring as readonly GeometryPoint[]);
  const distances = rings.flatMap((ring) => ring.map((start, index) =>
    distanceSquaredToSegment(point, start, ring[(index + 1) % ring.length])));
  const insideOuter = rings.length > 0 && pointInRing(point, rings[0]);
  const insideHole = rings.slice(1).some((ring) => pointInRing(point, ring));
  return { id: boundary.id, inside: insideOuter && !insideHole, distance: Math.min(...distances, Infinity) };
};
