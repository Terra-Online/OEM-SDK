// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createOEM, type OEMMapAPI } from '@opendfieldmap/map';
import { createManifest, json } from './fixtures';

let api: OEMMapAPI;
let host: HTMLDivElement;
beforeEach(async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(960);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(640);
  host = document.createElement('div');
  document.body.append(host);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/VL_1.json'))
        return json([
          ['2100500001', 500, 500, 0, 0, 'type_a'],
          ['2100500002', 500, 510, 0, -1, 'type_a'],
          ['2100500003', 500, 520, 0, 0, 'type_b'],
        ]);
      if (url.endsWith('/types.json'))
        return json(
          Object.fromEntries(
            ['type_a', 'type_b'].map((key) => [
              key,
              {
                key,
                icon: '/pin.webp',
                category: { main: 'item', sub: 'exploration' },
              },
            ]),
          ),
        );
      return json({});
    }),
  );
  api = await createOEM(host, {
    manifest: createManifest(),
    resources: { baseUrl: 'https://data.example', manifestPath: '/manifest.json' },
    features: { points: true },
    markerClustering: false,
  });
});
afterEach(() => {
  api.destroy();
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const node = (id: string) =>
  host.querySelector(
    `[data-oem-point="published:${({ a: '2100500001', b: '2100500002', c: '2100500003' } as Record<string, string>)[id]}"]`,
  );

it('retains published marker nodes across floor and type filtering without requests', async () => {
  const a = node('a');
  expect(a).not.toBeNull();
  const b = node('b');
  const c = node('c');
  vi.mocked(fetch).mockClear();
  await api.setFloor('B1');
  expect(node('a')).toBe(a);
  expect(node('b')).toBe(b);
  expect(node('c')).toBe(c);
  expect(a?.classList.contains('offLayer')).toBe(true);
  expect(b?.classList.contains('offLayer')).toBe(false);
  await api.setPointFilter({ types: ['type_a'] });
  expect(node('a')).toBe(a);
  expect(node('b')).toBe(b);
  expect(node('c')).toBeNull();
  await api.setPointFilter({ types: ['type_a', 'type_b'] });
  expect(node('a')).toBe(a);
  expect(node('b')).toBe(b);
  expect(node('c')).not.toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it('preserves every published point through repeated cluster membership changes', async () => {
  await api.setZoom(3);
  const original = ['a', 'b', 'c'].map(node);
  vi.mocked(fetch).mockClear();
  for (let cycle = 0; cycle < 3; cycle++) {
    await api.setMarkerClustering(true);
    expect(['a', 'b', 'c'].map(node)).toEqual(original);
    await api.setMarkerClustering(false);
    expect(['a', 'b', 'c'].map(node)).toEqual(original);
    expect(host.querySelectorAll('[data-oem-point]')).toHaveLength(3);
  }
  expect(fetch).not.toHaveBeenCalled();
});
