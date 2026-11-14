// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createOEMWidget, parseOEMUrlPatch } from '@opendfieldmap/sdk';
import type { OEMWidget } from '@opendfieldmap/sdk';
import { createManifest, json } from './fixtures';

let widget: OEMWidget | undefined;
afterEach(() => {
  widget?.destroy();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('switches main imagery, retains the preference across floors and unsupported regions, and uses native tile zoom', async () => {
  const manifest = createManifest();
  const region = manifest.regions[0];
  const coverage = Object.fromEntries(
    [0, 1, 2, 3].map((zoom) => [
      String(zoom),
      { M: Object.fromEntries(Array.from({ length: 41 }, (_, i) => [String(i - 20), [-20, 20]])) },
    ]),
  );
  region.coverage = coverage;
  region.satellite = { id: 'M', tileTemplate: '/satellite/{z}/{x}/{y}.webp', maxNativeZoom: 1, coverage };
  const other = structuredClone(region);
  other.id = 'Other';
  other.initialView.regionId = other.id;
  other.satellite = undefined;
  other.subregions = [];
  manifest.regions.push(other);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({})),
  );
  const host = document.createElement('div');
  host.style.cssText = 'width:800px;height:600px';
  document.body.append(host);
  widget = await createOEMWidget(host, { manifest, labels: false, markerTypes: false, satellite: true });
  const tiles = () => [...host.querySelectorAll<HTMLImageElement>('.leaflet-tile')].map((tile) => tile.src);
  expect(tiles().some((url) => url.includes('/satellite/1/'))).toBe(true);
  const center = widget.getState().center;
  await widget.setOptions({ floor: 'B1' });
  expect(tiles().some((url) => url.includes('/satellite/'))).toBe(false);
  expect(widget.getState()).toMatchObject({ satellite: true, center });
  await widget.setOptions({ floor: 'M' });
  expect(tiles().some((url) => url.includes('/satellite/'))).toBe(true);
  await widget.setOptions({ region: 'Other' });
  expect(tiles().some((url) => url.includes('/satellite/'))).toBe(false);
  expect(widget.getState().satellite).toBe(true);
  await widget.setOptions({ region: region.id });
  expect(tiles().some((url) => url.includes('/satellite/'))).toBe(true);
  await widget.setOptions({ satellite: false });
  expect(tiles().some((url) => url.includes('/satellite/'))).toBe(false);
  expect(widget.getState().satellite).toBe(false);
  expect(parseOEMUrlPatch('?satellite=1')).toMatchObject({ satellite: true });
});
