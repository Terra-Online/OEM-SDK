import { describe, expect, it, vi } from 'vitest';
import {
  fetchLatestGameVersion,
  formatGameVersionLabel,
  GAME_VERSION_ENDPOINT,
  GAME_VERSION_REQUEST_BASELINE,
  normalizeGameBuild,
  normalizeGameVersion,
  parseLauncherBuild,
  parseLatestGameVersion,
  resolveGameVersion,
} from '../scripts/game-version.mjs';

describe('Endfield game version resolution', () => {
  it('normalizes launcher and path version forms', () => {
    expect(normalizeGameVersion('1.5.3')).toEqual({ launcher: '1.5.3', path: '1_5_3' });
    expect(normalizeGameVersion('01_05_003')).toEqual({ launcher: '1.5.3', path: '1_5_3' });
    expect(() => normalizeGameVersion('1.5')).toThrow('Invalid Endfield game version');
  });

  it('combines the launcher version with an AKEData build label', () => {
    expect(normalizeGameBuild('10506507-7')).toBe('10506507-7');
    expect(formatGameVersionLabel('1_5_3', '10506507-7')).toBe('1.5.3 (10506507-7)');
    expect(() => normalizeGameBuild('../10506507-7')).toThrow('Invalid Endfield data build');
  });

  it('uses an explicit client build without consulting a mining checkout', async () => {
    const version = await resolveGameVersion(
      ['--game-version=1.7.2', '--game-build=12026241-3'],
      {},
      'unused-mining-checkout',
    );
    expect(version.gameVersionLabel).toBe('1.7.2 (12026241-3)');
    expect(version.buildSource).toBe('argument');
    expect(version.buildCommit).toBeUndefined();
  });

  it('reads the latest game response from a batch result', () => {
    expect(
      parseLatestGameVersion({
        proxy_rsps: [
          { kind: 'get_latest_launcher', get_latest_launcher_rsp: { version: '1.5.0' } },
          { kind: 'get_latest_game', get_latest_game_rsp: { version: '1.5.3' } },
        ],
      }),
    ).toEqual({ launcher: '1.5.3', path: '1_5_3' });
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
    expect(body.proxy_reqs).toEqual([
      {
        kind: 'get_latest_game',
        get_latest_game_req: {
          appcode: '6LL0KJuqHBVz33WK',
          launcher_appcode: 'abYeZZ16BPluCFyT',
          channel: '1',
          sub_channel: '1',
          version: GAME_VERSION_REQUEST_BASELINE,
        },
      },
    ]);
  });
});

it('reads the official client build for mining repositories without build commits', () => {
  const payload = {
    proxy_rsps: [
      {
        kind: 'get_latest_game',
        get_latest_game_rsp: {
          pkg: {
            packs: [
              {
                url: 'https://cdn.example/Beyond_Release_v1d6-Rel-cn-10781849-3_prod_obt_official.zip.001?auth_key=example',
              },
            ],
          },
        },
      },
    ],
  };
  expect(parseLauncherBuild(payload)).toBe('10781849-3');
  expect(() => parseLauncherBuild({})).toThrow('no client build');
});
