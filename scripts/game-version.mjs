import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const GAME_VERSION_ENDPOINT = 'https://launcher.hypergryph.com/api/proxy/batch_proxy';
export const GAME_VERSION_REQUEST_BASELINE = '1.3.3';

const GAME_VERSION_PATTERN = /^(\d+)[._](\d+)[._](\d+)$/;
const GAME_BUILD_PATTERN = /^\d+-\d+$/;
const root = fileURLToPath(new URL('../', import.meta.url));

/** Converts launcher and path forms into one validated game version pair. */
export const normalizeGameVersion = (value) => {
  const match = String(value).trim().match(GAME_VERSION_PATTERN);
  if (!match) throw new Error(`Invalid Endfield game version: ${value}`);
  const segments = match.slice(1).map((segment) => String(Number(segment)));
  return { launcher: segments.join('.'), path: segments.join('_') };
};

export const normalizeGameBuild = (value) => {
  const build = String(value).trim();
  if (!GAME_BUILD_PATTERN.test(build)) throw new Error(`Invalid Endfield data build: ${value}`);
  return build;
};

export const formatGameVersionLabel = (version, gameBuild) => {
  const normalized = typeof version === 'string' ? normalizeGameVersion(version) : version;
  return `${normalized.launcher} (${normalizeGameBuild(gameBuild)})`;
};

const resolveAkeDataBuild = (akeDataRoot) => {
  const value = execFileSync(
    'git',
    ['-C', akeDataRoot, 'log', '-1', '--format=%H%x00%s', '--extended-regexp', '--grep=^[0-9]+-[0-9]+$'],
    { encoding: 'utf8' },
  ).trim();
  const separator = value.indexOf('\0');
  if (separator < 0) throw new Error(`AKEData has no build-version commit: ${akeDataRoot}`);
  const commit = value.slice(0, separator);
  const gameBuild = normalizeGameBuild(value.slice(separator + 1));
  return { gameBuild, buildCommit: commit };
};

/** Reads the Endfield version from a Hypergryph batch proxy response. */
export const parseLatestGameVersion = (payload) => {
  const response = payload?.proxy_rsps?.find(
    (entry) => entry?.kind === 'get_latest_game',
  )?.get_latest_game_rsp;
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
      proxy_reqs: [
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
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Hypergryph launcher version request failed (${response.status})`);
  return parseLatestGameVersion(await response.json());
};

/** Resolves an explicit historical version or checks the current launcher version. */
export const resolveGameVersion = async (
  args = process.argv.slice(2),
  env = process.env,
  akeDataRoot = path.resolve(env.AKEDATA_ROOT ?? path.join(root, '../../Preview Repos/AKEData')),
) => {
  const argument = args.find((entry) => entry.startsWith('--game-version='))?.slice('--game-version='.length);
  const explicit = argument || env.OEM_GAME_VERSION;
  const version = explicit ? normalizeGameVersion(explicit) : await fetchLatestGameVersion();
  const buildArgument = args
    .find((entry) => entry.startsWith('--game-build='))
    ?.slice('--game-build='.length);
  const explicitBuild = buildArgument || env.OEM_GAME_BUILD;
  const dataBuild = resolveAkeDataBuild(akeDataRoot);
  const gameBuild = normalizeGameBuild(explicitBuild || dataBuild.gameBuild);
  return {
    ...version,
    gameBuild,
    gameVersionLabel: formatGameVersionLabel(version, gameBuild),
    buildCommit: dataBuild.buildCommit,
    source: explicit ? (argument ? 'argument' : 'environment') : 'hypergryph-launcher',
    buildSource: explicitBuild ? (buildArgument ? 'argument' : 'environment') : 'akedata-build-commit',
  };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await resolveGameVersion(), null, 2));
}
