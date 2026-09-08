import { describe, expect, it } from 'vitest';

describe('map entry', () => {
  it('can be imported without a DOM', async () => {
    const module = await import('@opendfieldmap/map');
    expect(module.createOEM).toBeTypeOf('function');
    await expect(module.createOEM('#map', {
      resources: { baseUrl: '/', manifestPath: '/manifest.json' },
    })).rejects.toThrow('must run in a browser');
  });

  it('imports the widget entry without a DOM', async () => {
    const module = await import('@opendfieldmap/sdk');
    expect(module.createOEMWidget).toBeTypeOf('function');
    await expect(module.createOEMWidget('#map')).rejects.toThrow('must run in a browser');
  });
});
