// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOEM, type OEMMapAPI } from '@opendfieldmap/map';
import { createOEMWidget } from '@opendfieldmap/sdk';
import { behaviorManifest, behaviorRows } from './behavior-fixtures';
import { deferred, json } from './fixtures';

let host: HTMLDivElement;
let api: OEMMapAPI;
const resources = { baseUrl: 'https://data.example', manifestPath: '/manifest.json' };
const respond = async (input: RequestInfo | URL) => {
  const path = new URL(String(input)).pathname;
  if (path === '/index.json')
    return json({
      1: '/VL_1.json',
      2: '/VL_1.json',
      3: '/VL_1.json',
      4: '/VL_1.json',
      5: '/VL_1.json',
      6: '/WL_1.json',
      7: '/VL_2.json',
    });
  if (path === '/VL_1.json') return json([1, 2, 3, 4, 5].map((id) => [id, 500, 400, 0, 0, 'crate_i']));
  if (path === '/VL_2.json') return json([[7, 510, 420, 0, 0, 'crate_i']]);
  if (path === '/WL_1.json') return json([[6, 510, 420, 0, 0, 'crate_i']]);
  if (path === '/behavior/VL_1.json') return json(behaviorRows());
  if (path === '/behavior/VL_2.json')
    return json([
      [
        't',
        7,
        [
          [500, 400],
          [510, 420],
        ],
        false,
      ],
    ]);
  if (path === '/behavior/WL_1.json')
    return json([
      [
        't',
        6,
        [
          [500, 400],
          [510, 420],
        ],
        false,
      ],
    ]);
  return json({});
};
const sidecarRequests = () =>
  vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes('/behavior/'));
const canvas = () => host.querySelector<HTMLCanvasElement>('.behaviorCanvas');
const select = (id: string | null) => api.setBehaviorPoint(id, { animate: false, flow: false });
beforeEach(async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  host = document.createElement('div');
  document.body.append(host);
  vi.stubGlobal('fetch', vi.fn(respond));
  api = await createOEM(host, { manifest: behaviorManifest(), resources });
});
afterEach(() => {
  api.destroy();
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('optional behavior overlay', () => {
  it('loads nothing eagerly and supports manifests without behavior data', async () => {
    expect(fetch).not.toHaveBeenCalled();
    expect(canvas()).toBeNull();
    api.destroy();
    const manifest = behaviorManifest();
    delete manifest.behaviors;
    api = await createOEM(host, { manifest, resources });
    expect(await api.loadBehavior('1')).toEqual([]);
    await select('1');
    expect(fetch).not.toHaveBeenCalled();
    expect(canvas()).toBeNull();
  });
  it('loads one shard on demand, reverses chest relations and protects cached geometry', async () => {
    const [first, reverse] = await Promise.all([api.loadBehavior('1'), api.loadBehavior('2')]);
    expect(first).toEqual(reverse);
    expect(first).toHaveLength(2);
    expect(sidecarRequests()).toHaveLength(1);
    if (first[1].kind !== 'butterfly-path') throw new Error('Expected route');
    first[1].stages[0].orderedPoints[0][0] = -999;
    first[1].segments[0].points[0][1] = -999;
    expect(await api.loadBehavior('1')).toEqual(reverse);
    expect(await api.loadBehavior('5')).toEqual([]);
    expect(await api.loadBehavior('unknown')).toEqual([]);
    expect(sidecarRequests()).toHaveLength(1);
    expect(api.getPoint('1')).toBeUndefined();
    expect(canvas()).toBeNull();
  });
  it('displays and clears without changing the camera, filters or point links', async () => {
    const state = api.getState();
    await select('2');
    expect(canvas()).not.toBeNull();
    expect(canvas()?.style.pointerEvents).toBe('none');
    expect(api.getState()).toEqual(state);
    expect(host.querySelector('[data-oem-point]')).toBeNull();
    await select(null);
    expect(canvas()).toBeNull();
    await select('missing');
    expect(canvas()).toBeNull();
    await expect(api.setBehaviorPoint('1', { animate: 'yes' as never })).rejects.toThrow('animate');
  });
  it('lets the latest selection win when an older shard finishes later', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockImplementation((input) =>
      String(input).endsWith('/behavior/VL_1.json') ? pending.promise : respond(input),
    );
    const old = select('1');
    await vi.waitFor(() => expect(sidecarRequests()).toHaveLength(1));
    await select('7');
    const current = canvas();
    expect(current).not.toBeNull();
    pending.resolve(json(behaviorRows()));
    await old;
    expect(canvas()).toBe(current);
    expect(host.querySelectorAll('.behaviorCanvas')).toHaveLength(1);
  });
  it.each(['clear', 'region'] as const)('does not restore a slow selection after %s', async (action) => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockImplementation((input) =>
      String(input).endsWith('/behavior/VL_1.json') ? pending.promise : respond(input),
    );
    const old = select('1');
    await vi.waitFor(() => expect(sidecarRequests()).toHaveLength(1));
    if (action === 'clear') await select(null);
    else await api.setRegion('Wuling');
    pending.resolve(json(behaviorRows()));
    await old;
    expect(canvas()).toBeNull();
  });
  it('rejects an interrupted wait on destruction and removes a rendered layer', async () => {
    await select('2');
    expect(canvas()).not.toBeNull();
    const pending = deferred<Response>();
    vi.mocked(fetch).mockImplementation((input) =>
      String(input).endsWith('/behavior/VL_2.json') ? pending.promise : respond(input),
    );
    const old = select('7');
    const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(sidecarRequests()).toHaveLength(2));
    api.destroy();
    await rejected;
    pending.resolve(
      json([
        [
          't',
          7,
          [
            [500, 400],
            [510, 420],
          ],
          false,
        ],
      ]),
    );
    expect(canvas()).toBeNull();
    expect(host.children).toHaveLength(0);
  });
  it('allows a cancelled reader to share the cached request with another reader', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockImplementation((input) =>
      String(input).endsWith('/behavior/VL_1.json') ? pending.promise : respond(input),
    );
    const controller = new AbortController();
    const cancelled = api.loadBehavior('1', { signal: controller.signal });
    const rejected = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    const retained = api.loadBehavior('2');
    await vi.waitFor(() => expect(sidecarRequests()).toHaveLength(1));
    controller.abort();
    await rejected;
    pending.resolve(json(behaviorRows()));
    expect(await retained).toHaveLength(2);
    expect(sidecarRequests()).toHaveLength(1);
  });
  it('reports failed loads and retries without retaining a rejected cache entry', async () => {
    const error = vi.fn();
    api.on('error', error);
    vi.mocked(fetch).mockImplementation((input) =>
      String(input).endsWith('/behavior/VL_1.json')
        ? Promise.resolve(new Response('', { status: 503 }))
        : respond(input),
    );
    await expect(select('1')).rejects.toThrow('503');
    expect(error).toHaveBeenCalledTimes(1);
    expect(canvas()).toBeNull();
    vi.mocked(fetch).mockImplementation(respond);
    await select('1');
    expect(canvas()).not.toBeNull();
    expect(sidecarRequests()).toHaveLength(2);
  });
  it('reads other-region records but requires an explicit region switch for drawing', async () => {
    expect(await api.loadBehavior('6')).toHaveLength(1);
    const state = api.getState();
    await expect(select('6')).rejects.toThrow('current region');
    expect(api.getState()).toEqual(state);
    expect(canvas()).toBeNull();
    await api.setRegion('Wuling');
    await select('6');
    expect(canvas()).not.toBeNull();
  });
  it('exposes the same opt-in commands on the Widget handle', async () => {
    api.destroy();
    const widget = await createOEMWidget(host, { manifest: behaviorManifest(), resources, labels: false });
    api = widget.map;
    expect(await widget.loadBehavior('2')).toHaveLength(2);
    await widget.setBehaviorPoint('2', { animate: false, flow: false });
    expect(canvas()).not.toBeNull();
    await widget.setBehaviorPoint(null);
    expect(canvas()).toBeNull();
    widget.destroy();
  });
});
