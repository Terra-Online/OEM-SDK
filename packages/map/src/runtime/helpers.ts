import type { OEMPoint, OEMPointFilter } from '@opendfieldmap/core';
import type { OEMCustomPoint } from '../types';

export const cloneFilter = (filter: OEMPointFilter): OEMPointFilter => ({
  types: filter.types ? [...filter.types] : undefined,
  subregions: filter.subregions ? [...filter.subregions] : undefined,
  floorOnly: filter.floorOnly,
});

const sameList = (left?: string[], right?: string[]): boolean =>
  left === right || (!!left && !!right && left.length === right.length &&
    left.every((value, index) => value === right[index]));

export const sameFilter = (left: OEMPointFilter, right: OEMPointFilter): boolean =>
  left.floorOnly === right.floorOnly &&
  sameList(left.types, right.types) &&
  sameList(left.subregions, right.subregions);

export const clonePoint = (point: OEMPoint): OEMPoint => ({
  ...point,
  raw: { ...point.raw },
  position: { ...point.position },
});

export const cloneCustomPoint = (point: OEMCustomPoint): OEMCustomPoint => ({
  ...point,
  position: { ...point.position },
});

export const CLUSTER_SUBCATEGORIES = new Set(['boss', 'collection', 'mob', 'natural', 'valuable', 'exploration']);
export const FEATURE_NAMES = ['points', 'labels', 'boundaries'] as const;
export type OEMFeatureName = typeof FEATURE_NAMES[number];
export const BRAND_URL = 'https://oem.re/';
export const GITHUB_URL = 'https://github.com/Terra-Online/OEM-SDK';
export const TERMS_URL = 'https://blog.opendfieldmap.org/docs/tos#intellectual-property-and-copyright';
