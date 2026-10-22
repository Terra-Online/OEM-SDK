import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { exportAtlosBehaviors, decodeOEMBehaviors } from '../scripts/atlos-behaviors.mjs';
import { behaviorCatalog, behaviorRows } from './behavior-fixtures';

const source = () => ({
  ...behaviorCatalog(),
  files: ['VL_1.json'],
  sourceRepository: 'AKEData',
  sourceCommit: 'test-source',
});
const run = (index = source(), rows = behaviorRows()) => {
  const objects = new Map();
  const read = vi.fn(async (name) => (name.endsWith('/index.json') ? index : rows));
  const versionedObject = vi.fn(async (namespace, name, value) => {
    const bytes = JSON.stringify(value);
    const path = `/${namespace}/1_6_3/__release__/${name}`;
    objects.set(path, bytes);
    return {
      path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: Buffer.byteLength(bytes),
    };
  });
  return {
    objects,
    read,
    versionedObject,
    result: exportAtlosBehaviors({
      read,
      versionedObject,
      icon: async () => '/marker/assets/hash/item/unlock_bubble.webp',
      regions: [{ subregions: [{ id: 'VL_1' }] }],
    }),
  };
};

describe('behavior export', () => {
  it('retains authored tuples, provenance and release-scoped integrity references', async () => {
    const index = source();
    const { objects, result } = run(index);
    const catalog = await result;
    expect(index.files).toEqual(['VL_1.json']);
    expect(catalog.sourceCommit).toBe('test-source');
    const ref = catalog.files.VL_1;
    const bytes = objects.get(ref.path);
    expect(JSON.parse(bytes)).toEqual(behaviorRows());
    expect(ref).toEqual({
      path: '/marker/1_6_3/__release__/behavior/VL_1.json',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: Buffer.byteLength(bytes),
    });
    expect(decodeOEMBehaviors(JSON.parse(bytes), catalog)).toHaveLength(4);
    expect(catalog.unlockIcon).toBe('/marker/assets/hash/item/unlock_bubble.webp');
  });
  it.each([['../VL_1.json'], ['UNKNOWN.json'], ['VL_1.json', 'VL_1.json']])(
    'rejects unsafe, unknown and repeated files: %j',
    async (...files) => {
      const { result, versionedObject } = run({ ...source(), files });
      await expect(result).rejects.toThrow();
      expect(versionedObject).not.toHaveBeenCalled();
    },
  );
  it('rejects unsupported encodings and corrupt geometry before writing a shard', async () => {
    const invalid = run({ ...source(), encoding: 'tuple-v2' });
    await expect(invalid.result).rejects.toThrow('behaviors.encoding');
    expect(invalid.versionedObject).not.toHaveBeenCalled();
    const corrupt = run(source(), [['t', 1, [[0, 0]], false]]);
    await expect(corrupt.result).rejects.toThrow('behaviors[0]');
    expect(corrupt.versionedObject).not.toHaveBeenCalled();
  });
});
