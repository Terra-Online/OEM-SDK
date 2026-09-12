// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOEM } from '@opendfieldmap/map';
import type { OEMMapAPI, OEMCustomPoint } from '@opendfieldmap/map';
import { createClickPointTool } from '@opendfieldmap/sdk';
import { createOEMCoordinateSnapshot, pixelToMapPosition, mapToPixelPosition } from '@opendfieldmap/core';
import type { OEMCoordinateSnapshot } from '@opendfieldmap/core';
import { createManifest, deferred, json } from './fixtures';

let host: HTMLDivElement;
let api: OEMMapAPI;
const point = (id: string, x = 400): OEMCustomPoint => ({ id, position: { regionId: 'Valley_4', x, z: 500, floorId: 'M' }, style: 'framed', icon: '/pin.webp' });
beforeEach(async () => {
  host = document.createElement('div'); host.style.cssText = 'width:800px;height:600px'; document.body.append(host);
  vi.stubGlobal('fetch', vi.fn(async input => {
    const url = String(input);
    if (url.endsWith('/VL_1.json')) return json([['2100500004', 500, 400, 0, 0, 'crate_i']]);
    if (url.endsWith('/types.json')) return json({ crate_i: { key: 'crate_i', icon: '/icon.webp', category: { main: 'item', sub: 'item' } } });
    return json({});
  }));
  api = await createOEM(host, { resources: { baseUrl: 'https://data.example', manifestPath: '/manifest' }, manifest: createManifest() });
});
afterEach(() => { api.destroy(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
const clickMap = () => host.querySelector('.mapRoot')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 200, clientY: 200 }));

describe('shared public behavior interface', () => {
  it('exposes only the public facade, with no Leaflet or DOM object', () => {
    expect(Object.isFrozen(api)).toBe(true);
    expect(api).not.toHaveProperty('map'); expect(api).not.toHaveProperty('root'); expect(api).not.toHaveProperty('container');
  });
  it('upserts and removes points without replacing untouched markers', async () => {
    await api.setCustomPoints([point('a'), point('b', 600)]);
    const first = host.querySelector('.markerInner[aria-label="a"]');
    await api.upsertCustomPoints([point('c')]);
    expect(host.querySelector('.markerInner[aria-label="a"]')).toBe(first);
    await api.upsertCustomPoints([point('a', 450)]);
    expect(host.querySelector('.markerInner[aria-label="a"]')).toBe(first);
    expect(api.getCustomPoint('a')?.position.x).toBe(450);
    await api.removeCustomPoints(['b', 'missing']); expect(api.getCustomPoints().map(p => p.id)).toEqual(['a', 'c']);
    await api.setFloor('B1'); expect(host.querySelector('.markerInner[aria-label="a"]')).toBe(first);
    expect(first?.classList.contains('offLayer')).toBe(true);
  });
  it('validates a complete replacement before changing any point', async () => {
    await api.setCustomPoints([point('host')]);
    await expect(api.upsertCustomPoints([point('valid'), { ...point('bad'), style: 'other' as never }])).rejects.toThrow();
    await expect(api.setCustomPoints([point('dup'), point('dup')])).rejects.toThrow();
    expect(api.getCustomPoints()).toEqual([point('host')]);
    await api.upsertCustomPoints([point('valid')]); expect(api.getCustomPoints()).toHaveLength(2);
  });
  it('provides collection changes and defensive read snapshots', async () => {
    const changed = vi.fn(); api.on('custompointschange', changed);
    await api.upsertCustomPoints([point('a')]);
    expect(changed).toHaveBeenLastCalledWith({ added: ['a'], updated: [], removed: [] });
    const snapshot = api.getCustomPoints(); snapshot[0].position.x = -999;
    expect(api.getCustomPoint('a')?.position.x).toBe(400);
    await api.upsertCustomPoints([point('a', 440)]);
    expect(changed).toHaveBeenLastCalledWith({ added: [], updated: ['a'], removed: [] });
    await api.removeCustomPoints(['a']); expect(changed).toHaveBeenLastCalledWith({ added: [], updated: [], removed: ['a'] });
  });
  it('keeps the requested locale while exposing the resolved locale', async () => {
    await api.setLocale('en-GB'); expect(api.getLocale()).toEqual({ requested: 'en-GB', resolved: 'en-US' });
  });
  it('does not retry an unrelated failed layer when only the view changes', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    await api.setFeatures({ labels: true }); vi.mocked(fetch).mockClear();
    await api.setView({ regionId: 'Valley_4', x: 4000, z: 4000, zoom: 3 });
    expect(fetch).not.toHaveBeenCalled(); expect(api.getResourceState().labels.status).toBe('error');
  });
  it('keeps independently requested point visibility when updating another property', async () => {
    await api.setPointFilter({ types: [] });
    await api.setFeatures({ points: true });
    await api.update({ zoom: 3 });
    expect(api.getResourceState().points.requested).toBe(true);
    expect(api.getPointFilter().types).toEqual([]);
  });
  it('does not turn a generic data filter into an invalid view selection', async () => {
    await api.setPointFilter({ subregions: ['not-in-this-region'], types: ['crate_i'] });
    expect(api.getState().subregionId).toBeNull();
    await api.update({ zoom: 3 });
    expect(api.getState().zoom).toBe(3);
    expect(api.getPointFilter().subregions).toEqual(['not-in-this-region']);
    await api.update({ markerTypes: '*' });
    expect(api.getPointFilter().subregions).toEqual(['not-in-this-region']);
    await api.setSubregion(null);
    expect(api.getPointFilter().subregions).toBeUndefined();
  });
  it('resolves a subregion owner and keeps points while switching regions', async () => {
    api.destroy();
    const manifest = createManifest();
    manifest.regions.push({ ...manifest.regions[0], id: 'Wuling', initialView: { ...manifest.regions[0].initialView, regionId: 'Wuling' }, subregions: [{ id: 'WL_1', key: 'Wuling', bounds: [[2000,2000],[4000,4000]] }] });
    api = await createOEM(host, { resources: { baseUrl: 'https://data.example', manifestPath: '/manifest' }, manifest });
    await api.upsertCustomPoints([point('a')]);
    await api.setSubregion('WL_1'); expect(api.getState()).toMatchObject({ regionId: 'Wuling', subregionId: 'WL_1', center: { x: 3000, z: 3000 } });
    expect(api.getCustomPoint('a')).toEqual(point('a')); expect(host.querySelector('.markerInner[aria-label="a"]')).toBeNull();
    await api.setRegion('Valley_4'); expect(host.querySelector('.markerInner[aria-label="a"]')).not.toBeNull();
  });
});

describe('reusable position records', () => {
  it('projects and unprojects map positions using container CSS pixels', () => {
    const input = { regionId: 'Valley_4', x: 450.5, z: 510.25 };
    const snapshot = api.unproject(api.project(input));
    expect(snapshot.mapPosition.x).toBeCloseTo(input.x, 6);
    expect(snapshot.mapPosition.z).toBeCloseTo(input.z, 6);
    expect(snapshot.pixelPosition.x).toBeCloseTo(input.x * 8, 6);
  });
  it('serializes a click for later calculation without adding a point', () => {
    const handler = vi.fn(); api.on('click', handler); clickMap();
    expect(api.getCustomPoints()).toEqual([]);
    const snapshot = handler.mock.calls[0][0] as OEMCoordinateSnapshot;
    expect(snapshot.context).toEqual({ schemaVersion: 1, gameVersion: '1_5_3', releaseId: 'test-release' });
    const serialized = JSON.stringify(snapshot); api.destroy();
    const saved = JSON.parse(serialized) as OEMCoordinateSnapshot;
    const region = createManifest().regions[0];
    expect(pixelToMapPosition(saved.pixelPosition, region).x).toBe(saved.mapPosition.x);
    expect(mapToPixelPosition(saved.mapPosition, region).z).toBe(saved.pixelPosition.z);
    // @ts-expect-error The snapshot's two coordinate spaces cannot be assigned interchangeably.
    const wrong: OEMCoordinateSnapshot['mapPosition'] = snapshot.pixelPosition;
    expect(wrong.space).toBe('pixel');
  });
  it('does not guess game coordinates when a subregion transform is uncertain', () => {
    const manifest = createManifest();
    manifest.regions[0].subregions[0].gameTransform = { scaleX: 2, scaleZ: 2, offsetX: 100, offsetZ: 100 };
    const position = { regionId: 'Valley_4', subregionId: 'VL_1', x: 400, z: 500 };
    const uncertain = createOEMCoordinateSnapshot(position, manifest, 'bounds');
    expect(uncertain.gamePosition).toBeNull(); expect(uncertain.gameResolution).toBe('subregion-unresolved');
    const supplied = createOEMCoordinateSnapshot(position, manifest);
    expect(supplied.gamePosition).toEqual({ space: 'game', x: 150, z: 200 });
    delete manifest.regions[0].gameTransform; delete manifest.regions[0].subregions[0].gameTransform;
    expect(createOEMCoordinateSnapshot(position, manifest).gameResolution).toBe('transform-unavailable');
  });
});

describe('point interaction and composition', () => {
  it('reports custom point activation independently of a map click', async () => {
    await api.setCustomPoints([point('a')]);
    const clicked = vi.fn(event => event.preventDefault()); const mapClick = vi.fn();
    api.on('pointclick', clicked); api.on('click', mapClick);
    const element = host.querySelector<HTMLElement>('.markerInner[aria-label="a"]')!;
    const allowed = element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(allowed).toBe(false); expect(mapClick).not.toHaveBeenCalled();
    expect(clicked).toHaveBeenCalledWith(expect.objectContaining({ source: 'custom', trigger: 'pointer', point: point('a') }));
    expect(api.getCustomPoints()).toHaveLength(1);
  });
  it('supports keyboard activation and stable hover boundaries', async () => {
    await api.setCustomPoints([point('a')]);
    const clicked = vi.fn(), entered = vi.fn(); api.on('pointclick', clicked); api.on('pointenter', entered);
    const element = host.querySelector<HTMLElement>('.markerInner[aria-label="a"]')!;
    element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(clicked).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'keyboard' }));
    element.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    element.querySelector('img')!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, relatedTarget: element }));
    expect(entered).toHaveBeenCalledTimes(1);
  });
  it('lets the host cancel published point navigation', async () => {
    await api.setFeatures({ points: true });
    const activate = vi.fn(event => event.preventDefault()); api.on('pointclick', activate);
    const anchor = host.querySelector<HTMLAnchorElement>('[data-oem-point^="published:"]')!;
    expect(anchor.href).toMatch(/^https:\/\/oem.re\//);
    expect(anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))).toBe(false);
    expect(activate).toHaveBeenCalledWith(expect.objectContaining({ source: 'published', point: expect.objectContaining({ id: '2100500004' }) }));
  });
  it('tools manage only their own points and preserve them when stopped', async () => {
    await api.setCustomPoints([point('host')]);
    const tool = createClickPointTool(api, { mode: 'multiple', style: 'framed', icon: '/pin.webp' });
    clickMap(); clickMap();
    await vi.waitFor(() => expect(tool.getPoints()).toHaveLength(2));
    await tool.setMode('single'); expect(tool.getPoints()).toHaveLength(1);
    const owned = tool.getPoints()[0].id;
    tool.destroy(); clickMap();
    expect(api.getCustomPoint(owned)).toBeDefined(); expect(api.getCustomPoint('host')).toBeDefined();
    await tool.clear(); expect(api.getCustomPoints()).toEqual([point('host')]);
  });
  it('stopping a tool cancels its queued additions without cancelling other commands', async () => {
    const pending = deferred<Response>(); vi.mocked(fetch).mockReturnValue(pending.promise);
    const load = api.loadCustomPoints('/custom.json');
    const tool = createClickPointTool(api, { mode: 'multiple', style: 'framed', icon: '/pin.webp' });
    clickMap(); await Promise.resolve(); await Promise.resolve();
    tool.destroy(); pending.resolve(json([point('host')]));
    await load; await api.setZoom(3);
    expect(api.getCustomPoints()).toEqual([{ ...point('host'), icon: new URL('/pin.webp', document.baseURI).href }]);
  });
});
