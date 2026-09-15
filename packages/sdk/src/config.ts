import { invalid } from '@opendfieldmap/core';
import {
  diffOEMMapConfig,
  equalOEMConfigValue,
  snapshotOEMMapConfig,
  validateOEMMapConfig,
} from '@opendfieldmap/map';
import type { OEMWidgetConfig, OEMWidgetControls } from './types';

export const OEM_WIDGET_CONTROL_DEFAULTS: Readonly<OEMWidgetControls> = Object.freeze({
  showRegionSelector: true,
  showFloorSelector: true,
  showScaleBar: true,
  horizontalSelectors: false,
});
const controlKeys = Object.keys(OEM_WIDGET_CONTROL_DEFAULTS) as (keyof OEMWidgetControls)[];

/** Dynamic-only, detached config shared by the Widget and React adapter. */
export function snapshotOEMWidgetConfig(input: OEMWidgetConfig): OEMWidgetConfig {
  validateOEMMapConfig(input);
  if (
    input.controls !== undefined &&
    (!input.controls || typeof input.controls !== 'object' || Array.isArray(input.controls))
  )
    invalid('options.controls', 'Expected an object');
  for (const key of Object.keys(input.controls ?? {}))
    if (!Object.hasOwn(OEM_WIDGET_CONTROL_DEFAULTS, key))
      invalid(`options.controls.${key}`, 'Unknown official control');
  const config: OEMWidgetConfig = snapshotOEMMapConfig(input);
  for (const key of controlKeys) {
    const value = input[key] ?? input.controls?.[key];
    if (input[key] === null || value === null) invalid(`options.${key}`, 'Expected boolean');
    if (value !== undefined) {
      if (typeof value !== 'boolean') invalid(`options.${key}`, 'Expected boolean');
      config[key] = value;
    }
  }
  return config;
}
export function diffOEMWidgetConfig(previous: OEMWidgetConfig, next: OEMWidgetConfig): OEMWidgetConfig {
  const before = snapshotOEMWidgetConfig(previous),
    after = snapshotOEMWidgetConfig(next);
  const result: OEMWidgetConfig = diffOEMMapConfig(before, after);
  for (const key of controlKeys)
    if (after[key] !== undefined && !equalOEMConfigValue(before[key], after[key])) result[key] = after[key];
  return result;
}
export function resolveOEMWidgetControls(input: OEMWidgetConfig): OEMWidgetControls {
  return Object.fromEntries(
    controlKeys.map((key) => [key, input[key] ?? OEM_WIDGET_CONTROL_DEFAULTS[key]]),
  ) as unknown as OEMWidgetControls;
}
