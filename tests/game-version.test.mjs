import { describe, expect, it, vi } from 'vitest';
import {
  fetchLatestGameVersion,
  GAME_VERSION_ENDPOINT,
  GAME_VERSION_REQUEST_BASELINE,
  normalizeGameVersion,
  parseLatestGameVersion,
} from '../scripts/game-version.mjs';

describe('Endfield game version resolution', () => {
  it('normalizes launcher and path version forms', () => {
    expect(normalizeGameVersion('1.5.3')).toEqual({ launcher: '1.5.3', path: '1_5_3' });
    expect(normalizeGameVersion('01_05_003')).toEqual({ launcher: '1.5.3', path: '1_5_3' });
    expect(() => normalizeGameVersion('1.5')).toThrow('Invalid Endfield game version');
  });

  it('reads the latest game response from a batch result', () => {
    expect(parseLatestGameVersion({
      proxy_rsps: [
        { kind: 'get_latest_launcher', get_latest_launcher_rsp: { version: '1.5.0' } },
        { kind: 'get_latest_game', get_latest_game_rsp: { version: '1.5.3' } },
      ],
    })).toEqual({ launcher: '1.5.3', path: '1_5_3' });
  });

  it('sends the launcher-compatible game request shape', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        proxy_rsps: [{ kind: 'get_latest_game', get_latest_game_rsp: { version: '1.5.3' } }],
      }),
    }));

    await expect(fetchLatestGameVersion(fetchImpl)).resolves.toEqual({ launcher: '1.5.3', path: '1_5_3' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, options] = fetchImpl.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(url).toBe(GAME_VERSION_ENDPOINT);
    expect(body.proxy_reqs).toEqual([{
      kind: 'get_latest_game',
      get_latest_game_req: {
        appcode: '6LL0KJuqHBVz33WK',
        launcher_appcode: 'abYeZZ16BPluCFyT',
        channel: '1',
        sub_channel: '1',
        version: GAME_VERSION_REQUEST_BASELINE,
      },
    }]);
  });
});
