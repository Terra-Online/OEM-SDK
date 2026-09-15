// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  createOEMWidget,
  diffOEMWidgetConfig,
  snapshotOEMWidgetConfig,
  parseOEMUrlPatch,
  parseOEMUrlState,
} from '@opendfieldmap/sdk';
import type { OEMWidget } from '@opendfieldmap/sdk';
import { pixelToMapPosition, mapToPixelPosition, toOEMMapPosition } from '@opendfieldmap/core';
import { createManifest, json } from './fixtures';

let widget: OEMWidget | undefined;
afterEach(() => {
  widget?.destroy();
  widget = undefined;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('shares grouped precedence, replacement, null and semantic diff rules', () => {
  const before = { layers: { markerTypes: ['a', 'b'] }, interaction: { lockZoom: false } };
  expect(diffOEMWidgetConfig(before, { markerTypes: ['a', 'b'], lockZoom: undefined })).toEqual({});
  expect(
    diffOEMWidgetConfig(before, { layers: { markerTypes: [] }, interaction: { lockZoom: true } }),
  ).toEqual({ markerTypes: [], lockZoom: true });
  expect(
    snapshotOEMWidgetConfig({ layers: { labels: false }, labels: true, controls: { showScaleBar: false } }),
  ).toMatchObject({ labels: true, showScaleBar: false });
  expect(snapshotOEMWidgetConfig({ subregion: null }).subregion).toBeNull();
  expect(() => snapshotOEMWidgetConfig({ zoom: null } as never)).toThrow('options.zoom');
  expect(() => snapshotOEMWidgetConfig({ view: { labels: false } } as never)).toThrow('options.view.labels');
});

it('keeps legacy URL resets while providing an omitted-key-preserving patch', () => {
  expect(parseOEMUrlState('?z=2').subregion).toBeNull();
  expect(parseOEMUrlPatch('?z=2').subregion).toBeUndefined();
  expect(parseOEMUrlPatch('?theme=dark&lockZoom=1&showScaleBar=0')).toMatchObject({
    theme: 'dark',
    lockZoom: true,
    showScaleBar: false,
  });
});

it('tags preferred coordinate results without changing legacy result shapes', () => {
  const region = createManifest().regions[0];
  const pixel = { space: 'pixel' as const, regionId: region.id, floorId: 'M', x: 800, z: -400 };
  expect(mapToPixelPosition(pixelToMapPosition(pixel, region), region)).toEqual(pixel);
  expect(toOEMMapPosition(pixel, region)).not.toHaveProperty('space');
});

it('uses manifest-defined regions/floors and commits controls only after successful map updates', async () => {
  const manifest = createManifest();
  manifest.defaultRegionId = manifest.regions[0].id = 'NewRegion';
  manifest.regions[0].initialView.regionId = 'NewRegion';
  manifest.regions[0].floors = [{ id: 'Deck', tileTemplate: '/tiles/{z}/{x}/{y}.webp' }];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({})),
  );
  const host = document.createElement('div');
  document.body.append(host);
  widget = await createOEMWidget(host, { manifest, layers: { labels: false } });
  expect(widget.getState()).toMatchObject({ regionId: 'NewRegion', floorId: 'Deck' });
  expect(host.querySelector('.regionSwitch svg')).not.toBeNull();
  await widget.setOptions({
    interaction: { lockZoom: true },
    controls: { showScaleBar: false, horizontalSelectors: true },
  });
  expect(widget.map.getState().lockZoom).toBe(true);
  expect(host.querySelector('.scaleControl')).toBeNull();
  expect(host.querySelector('.horizontalSelectors')).not.toBeNull();
  await expect(widget.setOptions({ floor: 'missing', controls: { showScaleBar: true } })).rejects.toThrow();
  expect(widget.getControlState().showScaleBar).toBe(false);
  await widget.setOptions({ controls: { showScaleBar: true } });
  expect(host.querySelector('.scaleControl')).not.toBeNull();
});
