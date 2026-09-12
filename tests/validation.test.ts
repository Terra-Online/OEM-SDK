import { describe, expect, it } from 'vitest';
import { fetchOEMJson, loadOEMManifest, OEMError, resolveOEMAsset, validateOEMManifest } from '@opendfieldmap/core';
import type { OEMManifest } from '@opendfieldmap/core';
import { createManifest, deferred } from './fixtures';
import { vi } from 'vitest';

const cases: [string, (m: OEMManifest) => void][] = [
  ['dimensions', m => { m.regions[0].dimensions = [] as never; }],
  ['tileSize', m => { m.regions[0].tileSize = Infinity; }],
  ['zoom range', m => { m.regions[0].minZoom = 8; }],
  ['locales', m => { delete (m as Partial<OEMManifest>).locales; }],
  ['boundsOffset', m => { m.regions[0].boundsOffset = undefined as never; }],
  ['initialView.zoom', m => { m.regions[0].initialView.zoom = NaN; }],
  ['region object', m => { m.regions[0] = null as never; }],
  ['duplicate floor', m => { m.regions[0].floors.push(m.regions[0].floors[0]); }],
  ['duplicate subregion', m => { m.regions[0].subregions.push(m.regions[0].subregions[0]); }],
  ['position region', m => { m.regions[0].initialView.regionId = 'unknown'; }],
];
describe('runtime wire validation', () => {
  it.each(cases)('rejects malformed %s with a field path', (_, mutate) => {
    const manifest = createManifest(); mutate(manifest);
    try { validateOEMManifest(manifest); throw new Error('Accepted malformed fixture'); }
    catch (error) { expect(error).toBeInstanceOf(OEMError); expect(error).toMatchObject({ code: 'INVALID_INPUT', path: expect.stringContaining('manifest.') }); }
  });
  it('allows extra fields and leaves publication metadata to export validation', () => {
    const manifest = createManifest();
    const input = { ...manifest, generatedAt: undefined, source: undefined, futureCapability: { version: 2 } };
    input.regions[0].points[0] = { path: '/points.json', bytes: 0, sha256: '' };
    expect(validateOEMManifest(input)).toBe(input);
  });
  it.each(['/safe/%2e%2e/private', '/safe/..\\private', '//other.test/path', 'https://other.test', '/safe/%5c../private', '/%'])('rejects unsafe relative resource path %s', path => {
    expect(() => resolveOEMAsset('https://data.example', path)).toThrow(OEMError);
  });
  it('preserves tile template placeholders and a configured base prefix', () => {
    expect(resolveOEMAsset('https://data.example/oem/', '/tiles/{z}/{x}/{y}.webp')).toBe('https://data.example/oem/tiles/{z}/{x}/{y}.webp');
  });
  it('cancels a transport that ignores the signal', async () => {
    const pending = deferred<Response>(); const fetch = vi.spyOn(globalThis, 'fetch').mockReturnValue(pending.promise);
    const controller = new AbortController();
    const result = fetchOEMJson('https://data.example/test', controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    pending.reject(new Error('late transport error'));
    fetch.mockRestore();
  });
  it('does not scan trusted manifest contents when loading from the resource origin', async () => {
    const manifest = { schemaVersion: 1, get regions() { throw new Error('Unnecessary scan'); } };
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => manifest } as Response);
    try {
      const result = await loadOEMManifest({ baseUrl: 'https://data.example', manifestPath: '/manifest' });
      expect(result).toBe(manifest);
    } finally { fetch.mockRestore(); }
  });
  it('reports invalid channel references as configuration errors', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"manifest":null}'));
    await expect(loadOEMManifest({ baseUrl: 'https://data.example', manifestPath: '/channel' })).rejects.toBeInstanceOf(OEMError);
    fetch.mockRestore();
  });
});
