import { pathToFileURL } from 'node:url';

export const GAME_VERSION_ENDPOINT = 'https://launcher.hypergryph.com/api/proxy/batch_proxy';
export const GAME_VERSION_REQUEST_BASELINE = '1.3.3';

const GAME_VERSION_PATTERN = /^(\d+)[._](\d+)[._](\d+)$/;

/** Converts launcher and path forms into one validated game version pair. */
export const normalizeGameVersion = (value) => {
  const match = String(value).trim().match(GAME_VERSION_PATTERN);
  if (!match) throw new Error(`Invalid Endfield game version: ${value}`);
  const segments = match.slice(1).map((segment) => String(Number(segment)));
  return { launcher: segments.join('.'), path: segments.join('_') };
};

/** Reads the Endfield version from a Hypergryph batch proxy response. */
export const parseLatestGameVersion = (payload) => {
  const response = payload?.proxy_rsps?.find((entry) => entry?.kind === 'get_latest_game')?.get_latest_game_rsp;
  if (!response?.version) throw new Error('Hypergryph launcher response has no Endfield game version');
  return normalizeGameVersion(response.version);
};

/** Queries the official domestic launcher channel without downloading game payloads. */
export const fetchLatestGameVersion = async (fetchImpl = fetch) => {
  const response = await fetchImpl(GAME_VERSION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      seq: String(Date.now()),
      proxy_reqs: [{
        kind: 'get_latest_game',
        get_latest_game_req: {
          appcode: '6LL0KJuqHBVz33WK',
          launcher_appcode: 'abYeZZ16BPluCFyT',
          channel: '1',
          sub_channel: '1',
          version: GAME_VERSION_REQUEST_BASELINE,
        },
      }],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Hypergryph launcher version request failed (${response.status})`);
  return parseLatestGameVersion(await response.json());
};

/** Resolves an explicit historical version or checks the current launcher version. */
export const resolveGameVersion = async (args = process.argv.slice(2), env = process.env) => {
  const argument = args.find((entry) => entry.startsWith('--game-version='))?.slice('--game-version='.length);
  const explicit = argument || env.OEM_GAME_VERSION;
  return explicit
    ? { ...normalizeGameVersion(explicit), source: argument ? 'argument' : 'environment' }
    : { ...await fetchLatestGameVersion(), source: 'hypergryph-launcher' };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await resolveGameVersion(), null, 2));
}
