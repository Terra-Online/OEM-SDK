import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveGameVersion, DEFAULT_GAME_DATA_ROOT } from './game-version.mjs';
import { getControlMessages } from './atlos-controls.mjs';
import { gameToOEMPosition } from './core-codec.mjs';
import { exportAtlosBehaviors } from './atlos-behaviors.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const akeDataRoot = path.resolve(process.env.AKEDATA_ROOT ?? DEFAULT_GAME_DATA_ROOT);
const gameDataRoot = path.resolve(process.env.OEM_GAME_DATA_ROOT ?? akeDataRoot);
const SCHEMA_VERSION = 1;
const GAME_GRID_SIZE = 128;
const args = process.argv.slice(2);
const sourceArg = args.find((argument) => !argument.startsWith('--'));
const source = path.resolve(sourceArg ?? path.join(root, '../Atlos/talos'));
const resolvedGameVersion = await resolveGameVersion(args, process.env, akeDataRoot);
const gameVersion = resolvedGameVersion.path;
const gameBuild = resolvedGameVersion.gameBuild;
const gameVersionLabel = resolvedGameVersion.gameVersionLabel;
const releasePlaceholder = '__release__';
const publicOutput = path.join(root, 'public');
const output = path.join(root, '.export-tmp');
await fs.rm(output, { recursive: true, force: true });
const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const pointIdLimit = 1n << 36n;
const sourceFiles = {};
const gameDataSourcePrefix = gameDataRoot === akeDataRoot ? 'AKEData/' : 'GameData/';
const includeLicensedNovecento =
  process.env.OEM_INCLUDE_LICENSED_NOVECENTO === '1' || args.includes('--include-licensed-novecento');
const read = async (relative) => {
  const bytes = await fs.readFile(path.join(source, relative));
  sourceFiles[relative] = sha256(bytes);
  return JSON.parse(bytes.toString());
};
const readAKEData = async (relative) => {
  const bytes = await fs.readFile(path.join(gameDataRoot, relative));
  sourceFiles[`${gameDataSourcePrefix}${relative}`] = sha256(bytes);
  return JSON.parse(bytes.toString());
};
const write = async (relative, content) => {
  const filename = path.join(output, relative);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, content);
};
const versionedObject = async (namespace, name, content) => {
  const bytes = typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content);
  const hash = sha256(bytes);
  const objectPath = `/${namespace}/${gameVersion}/${releasePlaceholder}/${name}`;
  await write(objectPath.slice(1), bytes);
  return { path: objectPath, sha256: hash, bytes: Buffer.byteLength(bytes) };
};
const transformGamePoint = (region, x, z) => {
  const position = gameToOEMPosition({ x, y: 0, z }, region);
  return { x: position.x, z: position.z };
};
const pointKey = ([x, z]) => `${x},${z}`;
const simplifyRing = (ring) =>
  ring.filter((point, index) => {
    const previous = ring[(index + ring.length - 1) % ring.length];
    const next = ring[(index + 1) % ring.length];
    return (
      (previous[0] - point[0]) * (next[1] - point[1]) !== (previous[1] - point[1]) * (next[0] - point[0])
    );
  });
const ringArea = (ring) =>
  ring.reduce((area, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
const mergeLevelGrids = (levelId, grids) => {
  const edges = new Map();
  const addEdge = (start, end) => {
    const key = `${pointKey(start)}>${pointKey(end)}`;
    const reverse = `${pointKey(end)}>${pointKey(start)}`;
    if (edges.has(reverse)) edges.delete(reverse);
    else edges.set(key, [start, end]);
  };
  for (const { x, z } of grids) {
    addEdge([x, z], [x + 1, z]);
    addEdge([x + 1, z], [x + 1, z + 1]);
    addEdge([x + 1, z + 1], [x, z + 1]);
    addEdge([x, z + 1], [x, z]);
  }
  const outgoing = new Map();
  for (const [key, edge] of edges) {
    const start = pointKey(edge[0]);
    if (outgoing.has(start)) throw new Error(`Ambiguous merged game boundary vertex: ${levelId}/${start}`);
    outgoing.set(start, { key, edge });
  }
  const rings = [];
  while (edges.size) {
    const first = edges.entries().next().value;
    const start = first[1][0];
    const ring = [];
    let cursor = start;
    do {
      ring.push(cursor);
      const next = outgoing.get(pointKey(cursor));
      if (!next || !edges.delete(next.key)) throw new Error(`Open merged game boundary ring: ${levelId}`);
      cursor = next.edge[1];
    } while (pointKey(cursor) !== pointKey(start));
    const simplified = simplifyRing(ring);
    if (simplified.length < 3) throw new Error(`Invalid merged game boundary ring: ${levelId}`);
    rings.push(simplified);
  }
  const mergedArea = Math.abs(rings.reduce((area, ring) => area + ringArea(ring), 0));
  if (Math.abs(mergedArea - grids.length) > 1e-9) {
    throw new Error(
      `Merged game boundary changed grid coverage: ${levelId} (${mergedArea} vs ${grids.length})`,
    );
  }
  return rings.sort((left, right) => Math.abs(ringArea(right)) - Math.abs(ringArea(left)));
};
const levelToGameBoundaries = (region, level) => {
  const transform = level.id === 'map02_lv010' ? subregionGameTransforms.WL_10 : undefined;
  const targetRegion = transform ? { ...region, gameTransform: transform } : region;
  const grids = (level.levelGrids ?? []).map((grid) => ({ x: grid.x ?? grid.X, z: grid.y ?? grid.Y }));
  if (grids.some((grid) => !Number.isInteger(grid.x) || !Number.isInteger(grid.z))) {
    throw new Error(`Invalid level grid coordinates: ${level.id}`);
  }
  const rect =
    level.rectLeftBottom && level.rectRightTop
      ? [level.rectLeftBottom.x, level.rectLeftBottom.y, level.rectRightTop.x, level.rectRightTop.y]
      : undefined;
  if (rect && rect.some((value) => !Number.isFinite(value)))
    throw new Error(`Invalid level rectangle: ${level.id}`);
  if (rect && grids.length) {
    const gridBounds = [
      Math.min(...grids.map((grid) => grid.x * GAME_GRID_SIZE)),
      Math.min(...grids.map((grid) => grid.z * GAME_GRID_SIZE)),
      Math.max(...grids.map((grid) => (grid.x + 1) * GAME_GRID_SIZE)),
      Math.max(...grids.map((grid) => (grid.z + 1) * GAME_GRID_SIZE)),
    ];
    if (gridBounds.some((value, index) => value !== rect[index])) {
      throw new Error(
        `Level grid rectangle mismatch: ${level.id} (${gridBounds.join(',')} vs ${rect.join(',')})`,
      );
    }
  }
  return {
    id: level.id,
    rings: mergeLevelGrids(level.id, grids).map((ring) =>
      ring.map(([x, z]) => transformGamePoint(targetRegion, x * GAME_GRID_SIZE, z * GAME_GRID_SIZE)),
    ),
  };
};
const walk = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const filename = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(filename) : [filename];
      }),
  );
  return files.flat();
};
const copyTree = async (relative) => {
  try {
    await fs.cp(path.join(publicOutput, relative), path.join(output, relative), { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};
await copyTree('fonts');
const regionSource = await read('src/data/map/region.json');
const rawTypes = await read('src/data/marker/type.json');
const overrides = await read('src/data/marker/manual/overrides.json');
const overrideSource = 'src/data/marker/overrides.js';
sourceFiles[overrideSource] = sha256(await fs.readFile(path.join(source, overrideSource)));
const { applyMarkerOverrides } = await import(pathToFileURL(path.join(source, overrideSource)).href);
const regionCodes = { Valley_4: 'VL', Wuling: 'WL', Dijiang: 'DJ', Weekraid_1: 'ES' };
const gameTransforms = {
  Valley_4: { scaleX: 0.4687511298, scaleZ: 0.4687511298, offsetX: 519.6990737, offsetZ: -479.9101599 },
  Wuling: {
    scaleX: 0.41269532778614415,
    scaleZ: 0.4126650261801654,
    offsetX: 953.3837664516041,
    offsetZ: -954.8108221139345,
  },
  Dijiang: {
    scaleX: 2.817109225144681,
    scaleZ: 2.8369668977222067,
    offsetX: 481.07581876506237,
    offsetZ: -528.2046998395613,
    rotateClockwise90: true,
  },
  Weekraid_1: {
    scaleX: 2.1236893194106514,
    scaleZ: 2.1398455301912183,
    offsetX: 613.9427764351295,
    offsetZ: -898.0955173659895,
  },
};
const subregionGameTransforms = {
  WL_10: {
    scaleX: 0.4137096391371761,
    scaleZ: 0.4128888476500381,
    offsetX: 954.4756325560732,
    offsetZ: -954.2980344081047,
  },
  WL_16: {
    scaleX: 0.3993875174662318,
    scaleZ: 0.39874115823831396,
    offsetX: 1226.6932149510947,
    offsetZ: -702.3025535059696,
  },
  WL_2: {
    scaleX: 0.3821317314759548,
    scaleZ: 0.3886861967050555,
    offsetX: 939.0266106648364,
    offsetZ: -961.708480136474,
  },
  WL_4: {
    scaleX: 0.35366404675795343,
    scaleZ: 0.3343953142019082,
    offsetX: 229.24501263356927,
    offsetZ: -1439.4211280688035,
  },
};
const regionNames = {
  Valley_4: '四号谷地',
  Wuling: '武陵',
  Dijiang: '帝江号',
  Weekraid_1: 'Etchspace Salvage',
};
const labels = await read('src/data/map/label/labels.json');
const subregions = [
  ...(await read('src/data/map/subregionData/VL.json')),
  ...(await read('src/data/map/subregionData/WL.json')),
];
const subregionsById = new Map(subregions.map((subregion) => [subregion.id, subregion]));
const { TILE_SIZE, getTileLayers } = await import(
  pathToFileURL(path.join(source, 'src/data/map/tiles.js')).href
);
const exportTiles = async (tileSource) => {
  const discoveredTileFiles = (await walk(path.join(source, `public/${tileSource}`))).filter((filename) =>
    filename.endsWith('.webp'),
  );
  const activeRegionIds = new Set(Object.keys(regionSource));
  const tileFiles = discoveredTileFiles.filter((filename) =>
    activeRegionIds.has(
      path.relative(path.join(source, `public/${tileSource}`), filename).split(path.sep)[0],
    ),
  );
  const ignoredTileRegions = [
    ...new Set(
      discoveredTileFiles
        .filter(
          (filename) =>
            !activeRegionIds.has(
              path.relative(path.join(source, `public/${tileSource}`), filename).split(path.sep)[0],
            ),
        )
        .map(
          (filename) => path.relative(path.join(source, `public/${tileSource}`), filename).split(path.sep)[0],
        ),
    ),
  ];
  const tileIndex = [];
  const coverage = {};
  const tileVersions = {};
  for (const filename of tileFiles) {
    const relative = path.relative(path.join(source, `public/${tileSource}`), filename);
    if (!/^[^/]+\/\d+\/-?\d+_-?\d+(?:_[a-z]\d+)?\.webp$/.test(relative)) continue;
    const content = await fs.readFile(filename);
    const tileHash = sha256(content);
    tileIndex.push({ relative: `${tileSource === 'clips' ? '' : 'satellite/'}${relative}`, hash: tileHash });
    const [regionId, zoom, tileName] = relative.split('/');
    const match = tileName.match(/^(-?\d+)_(-?\d+)(?:_([a-z]\d+))?\.webp$/);
    const [, tileX, tileY, suffix] = match;
    const floorId = suffix?.toUpperCase() ?? 'M';
    const rows = (((coverage[regionId] ??= {})[zoom] ??= {})[floorId] ??= {});
    (rows[tileY] ??= []).push(Number(tileX));
    const versionRows = (((tileVersions[regionId] ??= {})[zoom] ??= {})[floorId] ??= {});
    (versionRows[tileY] ??= {})[tileX] = tileHash.slice(0, 7);
    const floorSuffix = floorId === 'M' ? '' : `_${floorId.toLowerCase()}`;
    const target = `tiles/${gameVersion}/${gameBuild}/${tileSource === 'clips' ? '' : 'satellite/'}${regionId}/${zoom}/${tileX}/${tileY}${floorSuffix}.webp`;
    await write(target, content);
  }

  for (const [regionId, zooms] of Object.entries(coverage)) {
    for (const [zoom, floors] of Object.entries(zooms)) {
      for (const [floorId, rows] of Object.entries(floors)) {
        for (const [row, values] of Object.entries(rows)) {
          const sorted = [...new Set(values)].sort((left, right) => left - right);
          const ranges = [];
          for (const value of sorted) {
            if (ranges.length && ranges.at(-1) + 1 === value) ranges[ranges.length - 1] = value;
            else ranges.push(value, value);
          }
          rows[row] = ranges;
          const versions = tileVersions[regionId][zoom][floorId][row];
          tileVersions[regionId][zoom][floorId][row] = sorted.map((tileX) => versions[tileX]);
        }
      }
    }
  }
  return {
    coverage,
    tileVersions,
    tileIndex,
    ignoredTileRegions,
    ignoredTileCount: discoveredTileFiles.length - tileFiles.length,
  };
};
const standardTiles = await exportTiles('clips');
const satelliteTiles = await exportTiles('satellite');
const { coverage, ignoredTileRegions, ignoredTileCount } = standardTiles;
const tileIndex = [...standardTiles.tileIndex, ...satelliteTiles.tileIndex].sort((a, b) =>
  a.relative.localeCompare(b.relative),
);
const tileContentHash = sha256(JSON.stringify(tileIndex));
const floorTileVersions = (tiles, regionId, floorId) =>
  Object.fromEntries(
    Object.entries(tiles.tileVersions[regionId] ?? {})
      .filter(([, floors]) => floors[floorId])
      .map(([zoom, floors]) => [zoom, floors[floorId]]),
  );
const nativeZoom = (zooms, floorId) =>
  Math.max(
    0,
    ...Object.entries(zooms ?? {})
      .filter(([, floors]) => floors[floorId] && Object.keys(floors[floorId]).length)
      .map(([zoom]) => Number(zoom)),
  );
// Bounds follow actual tile coverage. The coordinate basis remains coordZoom,
// independent of the imagery's native levels (including satellite imagery).
const coverageBounds = (zooms, coordZoom) => {
  const corners = Object.entries(zooms).flatMap(([zoom, floors]) =>
    Object.values(floors).flatMap((rows) =>
      Object.entries(rows).flatMap(([y, ranges]) =>
        ranges.flatMap((x, i) => [
          x * TILE_SIZE * 2 ** (coordZoom - Number(zoom)) +
            (i % 2 ? TILE_SIZE * 2 ** (coordZoom - Number(zoom)) : 0),
          Number(y) * TILE_SIZE * 2 ** (coordZoom - Number(zoom)),
          (Number(y) + 1) * TILE_SIZE * 2 ** (coordZoom - Number(zoom)),
        ]),
      ),
    ),
  );
  if (!corners.length) throw new Error('Empty tile coverage');
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < corners.length; i += 3) {
    minX = Math.min(minX, corners[i]);
    maxX = Math.max(maxX, corners[i]);
    minY = Math.min(minY, corners[i + 1]);
    maxY = Math.max(maxY, corners[i + 2]);
  }
  return { dimensions: [maxX - minX, maxY - minY], boundsOffset: { x: minX, z: -maxY } };
};
const fonts = [];
const fontLicenses = [];
let fontLicense;
const exportFont = async ({ relative, family, weight, weightRange, namespace = 'harmony' }) => {
  const content = await fs.readFile(path.join(source, relative));
  const digest = sha256(content);
  sourceFiles[relative] = digest;
  const filename = path.basename(relative);
  const fontPath = `/fonts/${namespace}/${digest}/${filename}`;
  await write(fontPath.slice(1), content);
  fonts.push({
    path: fontPath,
    sha256: digest,
    bytes: content.byteLength,
    family,
    weight,
    weightRange,
    style: 'normal',
  });
};
// HarmonyOS Sans is the Atlos Latin/UI face and may be redistributed with the
// software when its license notice is retained. It is a variable font, so keep
// the complete weight axis available to consumers.
await exportFont({
  relative: 'src/assets/fonts/Harmony/HMSans.woff2',
  family: 'HMSans_EN',
  weight: 400,
  weightRange: [100, 900],
});
const harmonyLicenseRelative = 'src/assets/fonts/LICENSE/Harmony OS Sans/Harmony OS Sans - License.txt';
const harmonyLicenseContent = await fs.readFile(path.join(source, harmonyLicenseRelative));
const harmonyLicenseHash = sha256(harmonyLicenseContent);
sourceFiles[harmonyLicenseRelative] = harmonyLicenseHash;
const harmonyLicensePath = `/fonts/harmony/${harmonyLicenseHash}/LICENSE.txt`;
await write(harmonyLicensePath.slice(1), harmonyLicenseContent);
fontLicenses.push({
  path: harmonyLicensePath,
  sha256: harmonyLicenseHash,
  bytes: harmonyLicenseContent.byteLength,
});

if (includeLicensedNovecento) {
  // These are the Wide faces used by Atlos. The Cyrillic and Vietnamese files
  // intentionally retain Atlos' separate family names so browser fallback can
  // select the glyph-complete face for each script.
  const novecentoFiles = [
    { filename: 'Novecento-WideBold.woff2', family: 'Novecento Wide Bold', weight: 700 },
    { filename: 'Novecento-WideDemiBold.woff2', family: 'Novecento Wide DemiBold', weight: 600 },
    { filename: 'Novecento-WideMedium.woff2', family: 'Novecento Wide Medium', weight: 500 },
    { filename: 'NWDemiBold+Grek+Cyrl.woff2', family: 'Novecento Cyrillic DemiBold', weight: 600 },
    { filename: 'NWMed+Grek+Cyrl.woff2', family: 'Novecento Cyrillic Medium', weight: 500 },
    { filename: 'NWBold+Viet.woff2', family: 'Novecento Vietnamese DemiBold', weight: 600 },
    { filename: 'NWMed+Viet.woff2', family: 'Novecento Vietnamese Medium', weight: 500 },
  ];
  for (const font of novecentoFiles) {
    await exportFont({
      relative: `src/assets/fonts/Novecento/${font.filename}`,
      family: font.family,
      weight: font.weight,
      namespace: 'novecento',
    });
  }
  const licenseRelative =
    'src/assets/fonts/LICENSE/Novecento Sans/Synthview Type Design - Webfont License 1.0.0.txt';
  const licenseContent = await fs.readFile(path.join(source, licenseRelative));
  const licenseHash = sha256(licenseContent);
  sourceFiles[licenseRelative] = licenseHash;
  const licensePath = `/fonts/novecento/${licenseHash}/LICENSE.txt`;
  await write(licensePath.slice(1), licenseContent);
  fontLicense = { path: licensePath, sha256: licenseHash, bytes: licenseContent.byteLength };
  fontLicenses.push(fontLicense);
}
const types = {};
const missingIcons = [];
const aliasedIcons = [];
const sourceTypeAliases = new Map();
const iconAliases = {
  'item/mission': 'item/mission_npc',
  'item/cuprium_ore': 'marker/cuprium_spot',
  'item/gloomwalds_rage': 'item/gloomwalds_age',
};
const icon = async (key, sub = false) => {
  const folder = sub ? 'marker/sub' : key.endsWith('_spot') ? 'marker' : 'item';
  const requested = `${folder}/${key}`;
  const resolved = iconAliases[requested] ?? requested;
  const relative = `src/assets/images/${resolved}.webp`;
  try {
    const content = await fs.readFile(path.join(source, relative));
    sourceFiles[relative] = sha256(content);
    if (resolved !== requested) aliasedIcons.push({ requested, source: resolved });
    // Marker images are additive shared assets, not release data. Content
    // addressing keeps immutable historical manifests valid while allowing
    // unchanged icons to be reused by every release.
    const assetHash = sha256(content);
    const assetPath = `/marker/assets/${assetHash}/${requested}.webp`;
    await write(assetPath.slice(1), content);
    return assetPath;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    missingIcons.push(relative);
    return undefined;
  }
};
for (const [key, type] of Object.entries(rawTypes)) {
  if (type.category.main === 'npc' || type.category.main === 'files') {
    sourceTypeAliases.set(key, type.category.main);
    continue;
  }
  sourceTypeAliases.set(key, key);
  types[key] = {
    key,
    category: type.category,
    noFrame: type.noFrame,
    icon: await icon(type.icon ?? key),
    subIcon: type.subIcon ? await icon(type.subIcon, true) : undefined,
  };
}
types.npc = { key: 'npc', category: { main: 'npc', sub: 'npc' }, icon: await icon('mission_npc') };
types.files = {
  key: 'files',
  category: { main: 'files', sub: 'archives' },
  icon: await icon('prts_read_note'),
};
if (missingIcons.length) throw new Error(`Unresolved Atlos icons: ${missingIcons.join(', ')}`);
const directTypeAliases = new Map([
  ['racing_npc', 'npc'],
  ['aic_steward', 'npc'],
  ['rare_gathering_site', 'gather'],
  ['rare_mining_site', 'gather'],
]);
const excludedPoints = [];
const normalizePointType = (point) => {
  const sourceType = point.type;
  if (sourceTypeAliases.has(sourceType)) return sourceTypeAliases.get(sourceType);
  if (directTypeAliases.has(sourceType)) return directTypeAliases.get(sourceType);
  if (/^int_trchest_wrdg001_/i.test(sourceType)) return 'crate_i';
  if (/^int_vending_machine_area/i.test(sourceType)) return 'white_auto_vender';
  throw new Error(`Unmapped marker type ${JSON.stringify(sourceType)} for point ${point.id}`);
};
const pointIds = new Set();
const stats = {};
const pointIndex = {};
const regions = [];
const gameBoundaryStats = {};
const gameMapIds = {
  Valley_4: 'map01',
  Wuling: 'map02',
  Dijiang: 'base01_dg001',
  Weekraid_1: 'dung01_wrdg001',
};
for (const [id, config] of Object.entries(regionSource)) {
  const coordZoom = config.coordZoom;
  const standardCoverage = coverage[id] ?? {};
  const satelliteCoverage = satelliteTiles.coverage[id];
  const allCoverage = {
    ...Object.fromEntries(Object.entries(standardCoverage).map(([zoom, floors]) => [zoom, { ...floors }])),
  };
  for (const [zoom, floors] of Object.entries(satelliteCoverage ?? {})) {
    (allCoverage[zoom] ??= {}).satellite = floors.M;
  }
  const { dimensions, boundsOffset } = coverageBounds(allCoverage, coordZoom);
  const floorIds = getTileLayers({
    zooms: Object.fromEntries(
      Object.entries(standardCoverage).map(([zoom, floors]) => [
        zoom,
        Object.fromEntries(
          Object.entries(floors).map(([floor, rows]) => [
            floor === 'M' ? '' : `_${floor.toLowerCase()}`,
            rows,
          ]),
        ),
      ]),
    ),
  });
  const maxTileZoom = Math.max(...Object.keys(allCoverage).map(Number));
  const region = {
    id,
    name: regionNames[id] ?? id,
    locales: {},
    dimensions,
    boundsOffset,
    gameTransform: gameTransforms[id],
    tileSize: TILE_SIZE,
    minZoom: 0,
    maxNativeZoom: coordZoom,
    maxZoom: maxTileZoom + (['Valley_4', 'Wuling'].includes(id) ? 1.5 : 1),
    initialView: {
      regionId: id,
      floorId: 'M',
      x: config.initialCenter.lng * 2 ** coordZoom,
      z: config.initialCenter.lat * 2 ** coordZoom,
      zoom: config.initialZoom,
    },
    floors: floorIds.map((floorId) => ({
      id: floorId,
      tileTemplate: `/tiles/${gameVersion}/${gameBuild}/${id}/{z}/{x}/{y}${floorId === 'M' ? '' : `_${floorId.toLowerCase()}`}.webp`,
      tileVersions: floorTileVersions(standardTiles, id, floorId),
      maxNativeZoom: nativeZoom(standardCoverage, floorId),
    })),
    satellite: satelliteCoverage
      ? {
          id: 'M',
          tileTemplate: `/tiles/${gameVersion}/${gameBuild}/satellite/${id}/{z}/{x}/{y}.webp`,
          tileVersions: floorTileVersions(satelliteTiles, id, 'M'),
          maxNativeZoom: nativeZoom(satelliteCoverage, 'M'),
          coverage: satelliteCoverage,
        }
      : undefined,
    subregions: config.subregions.map((subregionId) => {
      const subregion = subregionsById.get(subregionId);
      const bounds =
        subregion?.bounds?.length >= 2
          ? [
              [subregion.bounds[0][0], -subregion.bounds[1][1]],
              [subregion.bounds[1][0], -subregion.bounds[0][1]],
            ]
          : undefined;
      return {
        id: subregionId,
        key: subregion?.name ?? subregionId,
        bounds,
        gameTransform: subregionGameTransforms[subregionId],
      };
    }),
    points: [],
    coverage: coverage[id] ?? {},
  };
  for (const subregionId of config.subregions) {
    const raw = await read(`src/data/marker/data/${subregionId}.json`);
    const normalized = raw.map((entry) => {
      const value = Array.isArray(entry)
        ? { id: entry[0], z: entry[1], x: entry[2], y: entry[3], tier: entry[4], type: entry[5] }
        : entry;
      return {
        ...value,
        id: String(value.id),
        z: value.z ?? value.pos?.[0] ?? 0,
        x: value.x ?? value.pos?.[1] ?? 0,
        y: value.y ?? value.pos?.[2] ?? 0,
        tier: value.tier ?? 0,
        subregId: value.subregId ?? subregionId,
        type: value.type ?? '',
      };
    });
    const corrected = applyMarkerOverrides(normalized, overrides, { subregionId });
    const points = corrected.flatMap((point) => {
      if (!point.id || pointIds.has(point.id)) throw new Error(`Duplicate/invalid point ID: ${point.id}`);
      if (!/^\d+$/.test(point.id) || BigInt(point.id) >= pointIdLimit)
        throw new Error(`Point ID cannot use an OEM short link: ${point.id}`);
      if (![point.x, point.y, point.z, point.tier].every(Number.isFinite))
        throw new Error(`Invalid coordinates: ${point.id}`);
      if (point.id === '2800000983' || point.type === 'cv_wall') {
        excludedPoints.push({
          id: point.id,
          type: point.type || null,
          reason: point.type === 'cv_wall' ? 'unsupported-collision-volume' : 'missing-type',
        });
        return [];
      }
      const type = normalizePointType(point);
      if (!types[type]) throw new Error(`Normalized marker type is unavailable: ${point.type} -> ${type}`);
      pointIds.add(point.id);
      // Preserve Atlos' compact tuple representation. The runtime decodes
      // tuples using the same fallback-subregion rules as Atlos' interpreter.
      if (point.subregId === subregionId) return [[point.id, point.z, point.x, point.y, point.tier, type]];
      return [
        {
          id: point.id,
          z: point.z,
          x: point.x,
          y: point.y,
          tier: point.tier,
          subregId: point.subregId,
          type,
        },
      ];
    });
    const ref = await versionedObject('marker', `points/${subregionId}.json`, points);
    region.points.push(ref);
    for (const point of points) {
      const pointId = Array.isArray(point) ? point[0] : point.id;
      pointIndex[String(pointId)] = ref.path;
    }
    stats[subregionId] = { source: raw.length, afterOverrides: corrected.length, exported: points.length };
  }
  const code = regionCodes[id];
  const regionLabels = Object.values(labels.regions[code]?.labels ?? {}).map((label) => ({
    id: label.id,
    type: label.type,
    position: { regionId: id, x: label.point[0], z: -label.point[1] },
    textKey: `${code}.sub.${label.sub === '__root__' ? '' : `${label.sub}.`}${label.type === 'sub' ? 'name' : `site.${label.site}`}`,
  }));
  region.labels = await versionedObject('map', `labels/${id}.json`, regionLabels);
  const boundaries = subregions
    .filter((subregion) => config.subregions.includes(subregion.id))
    .map((subregion) => {
      const rings = subregion.polygon?.length
        ? subregion.polygon
        : subregion.bounds?.length >= 2
          ? [
              [
                [subregion.bounds[0][0], subregion.bounds[0][1]],
                [subregion.bounds[1][0], subregion.bounds[0][1]],
                [subregion.bounds[1][0], subregion.bounds[1][1]],
                [subregion.bounds[0][0], subregion.bounds[1][1]],
              ],
            ]
          : [];
      return {
        id: subregion.id,
        rings: rings.map((ring) => ring.map(([pixelX, pixelZ]) => ({ x: pixelX, z: -pixelZ }))),
      };
    })
    .filter((boundary) => boundary.rings.length);
  region.boundaries = await versionedObject('map', `boundaries/${id}.json`, {
    count: boundaries.length,
    boundaries,
  });
  const gameMapId = gameMapIds[id];
  if (!gameMapId) throw new Error(`AKEData map ID is missing: ${id}`);
  const mapConfig = await readAKEData(`Json/MapConfig/${gameMapId}.json`);
  const levelIds = [...(mapConfig.levelStrIds ?? [])];
  if (!levelIds.length) throw new Error(`MapConfig levelStrIds is missing: ${gameMapId}`);
  const rawLevels = await Promise.all(
    levelIds.map((levelId) => readAKEData(`Json/LevelConfig/${levelId}.json`)),
  );
  // EndfieldData retains Unity field prefixes; AKEData strips them.
  const levels = rawLevels.map((level) => ({
    id: level.id ?? level.m_id,
    levelGrids: (level.levelGrids ?? level.m_levelGrids ?? []).map((grid) => ({
      x: grid.x ?? grid.X ?? grid.m_X,
      y: grid.y ?? grid.Y ?? grid.m_Y,
    })),
    rectLeftBottom: level.rectLeftBottom ?? level.m_rectLeftBottom,
    rectRightTop: level.rectRightTop ?? level.m_rectRightTop,
  }));
  const gameBoundaries = levels.map((level) => levelToGameBoundaries(region, level));
  region.gameBoundaries = await versionedObject('map', `boundaries/${id}.game.json`, {
    count: gameBoundaries.length,
    boundaries: gameBoundaries,
  });
  gameBoundaryStats[id] = {
    mapId: gameMapId,
    levels: levels.map((level) => ({ id: level.id, grids: level.levelGrids?.length ?? 0 })),
    boundaries: gameBoundaries.length,
    tiles: levels.reduce((count, level) => count + (level.levelGrids?.length ?? 0), 0),
  };
  regions.push(region);
}
const flatten = (value, prefix = '', result = {}) => {
  for (const [key, entry] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof entry === 'string') result[name] = entry;
    else if (entry && typeof entry === 'object') flatten(entry, name, result);
  }
  return result;
};
const locales = {};
const localeBundles = {};
const controls = {};
const fallback = flatten(await read('src/locale/data/region/en-US.json'));
for (const filename of (await fs.readdir(path.join(source, 'src/locale/data/region'))).sort()) {
  if (!filename.endsWith('.json')) continue;
  const sourceLocale = filename.replace('.json', '');
  const locale = sourceLocale === 'zh-TW' ? 'zh-HK' : sourceLocale;
  const messages = { ...fallback, ...flatten(await read(`src/locale/data/region/${filename}`)) };
  const uiMessages = await read(`src/locale/data/ui/${locale}.json`);
  localeBundles[locale] = messages;
  controls[locale] = getControlMessages(uiMessages, locale);
  locales[locale] = await versionedObject('marker', `locales/${locale}/places.json`, messages);
}
for (const region of regions) {
  const regionCode = regionCodes[region.id];
  for (const [locale, messages] of Object.entries(localeBundles)) {
    const name = messages[`${regionCode}.main`];
    if (typeof name === 'string') region.locales[locale] = name;
  }
  region.locales['en-US'] ??= region.name;
  for (const subregion of region.subregions) {
    const prefix = `${regionCode}.sub.${subregion.key}`;
    const localized = {};
    for (const [locale, messages] of Object.entries(localeBundles)) {
      const name = messages[`${prefix}.name`];
      const short = messages[`${prefix}.short`];
      if (typeof name === 'string')
        localized[locale] = {
          name,
          short: typeof short === 'string' && short.trim() ? short : subregion.key,
        };
    }
    if (Object.keys(localized).length) subregion.locales = localized;
  }
}
const pointIndexRef = await versionedObject('marker', 'point-index.json', pointIndex);
const typeRef = await versionedObject('marker', 'type.json', types);
const behaviors = await exportAtlosBehaviors({ read, versionedObject, icon, regions });
const releaseId = `atlos-${sha256(JSON.stringify({ schemaVersion: SCHEMA_VERSION, gameVersion, gameBuild, regions, types: typeRef, pointIndex: pointIndexRef, behaviors, locales, controls, fonts, fontLicense, fontLicenses, tileContentHash })).slice(0, 7)}`;
const placeholderPathSegment = `/${gameVersion}/${releasePlaceholder}/`;
const releasePathSegment = `/${gameVersion}/${releaseId}/`;
const finalizeReleasePaths = (value) => {
  if (typeof value === 'string') return value.replace(placeholderPathSegment, releasePathSegment);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) value[index] = finalizeReleasePaths(value[index]);
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) value[key] = finalizeReleasePaths(entry);
  }
  return value;
};
for (const value of [regions, types, pointIndex, typeRef, pointIndexRef, behaviors, locales])
  finalizeReleasePaths(value);
for (const [name, value, ref] of [
  ['type.json', types, typeRef],
  ['point-index.json', pointIndex, pointIndexRef],
]) {
  const bytes = JSON.stringify(value);
  await write(`marker/${gameVersion}/${releasePlaceholder}/${name}`, bytes);
  ref.sha256 = sha256(bytes);
  ref.bytes = Buffer.byteLength(bytes);
}
for (const namespace of ['marker', 'map']) {
  await fs.rename(
    path.join(output, namespace, gameVersion, releasePlaceholder),
    path.join(output, namespace, gameVersion, releaseId),
  );
}
const gameDataFiles = Object.keys(sourceFiles)
  .filter((filename) => filename.startsWith(gameDataSourcePrefix))
  .map((filename) => filename.slice(gameDataSourcePrefix.length));
let gameDataCommit;
try {
  // A client extract can live inside another checkout. Its files must be tracked
  // and match HEAD before that checkout's commit can describe the boundary data.
  execFileSync('git', ['-C', gameDataRoot, 'ls-files', '--error-unmatch', '--', ...gameDataFiles], {
    stdio: 'ignore',
  });
  execFileSync('git', ['-C', gameDataRoot, 'diff', '--quiet', 'HEAD', '--', ...gameDataFiles], {
    stdio: 'ignore',
  });
  gameDataCommit = execFileSync('git', ['-C', gameDataRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
} catch {
  // The export report records the exact input hashes for a local snapshot.
}
const manifest = {
  schemaVersion: SCHEMA_VERSION,
  gameVersion,
  gameBuild,
  gameVersionLabel,
  releaseId,
  generatedAt: new Date().toISOString(),
  defaultRegionId: 'Valley_4',
  regions,
  types: typeRef,
  pointIndex: pointIndexRef,
  behaviors,
  fonts,
  fontLicense,
  fontLicenses,
  locales,
  controls,
  fallbackLocale: 'en-US',
  source: {
    repository: 'Atlos',
    commit: execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    gameDataRepository: gameDataCommit ? 'AKEDataMining' : 'local snapshot',
    gameDataCommit,
    usage:
      'Local development snapshot only. SDK AGPL-3.0; asset redistribution permission must be confirmed separately.',
  },
};
const manifestPath = `/releases/${releaseId}/manifest.json`;
let manifestBytes = JSON.stringify(manifest);
try {
  manifestBytes = await fs.readFile(path.join(publicOutput, manifestPath.slice(1)));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await write(manifestPath.slice(1), manifestBytes);
await write(
  'channels/stable.json',
  JSON.stringify({
    manifest: { path: manifestPath, sha256: sha256(manifestBytes), bytes: Buffer.byteLength(manifestBytes) },
  }),
);
await fs.rm(publicOutput, { recursive: true, force: true });
await fs.rename(output, publicOutput);
await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
await fs.writeFile(
  path.join(root, 'artifacts/export-report.json'),
  JSON.stringify(
    {
      releaseId,
      gameVersion,
      gameBuild,
      gameVersionLabel,
      launcherVersion: resolvedGameVersion.launcher,
      versionSource: resolvedGameVersion.source,
      buildSource: resolvedGameVersion.buildSource,
      buildCommit: resolvedGameVersion.buildCommit,
      tileContentHash,
      tileCount: tileIndex.length,
      pointCount: pointIds.size,
      typeCount: Object.keys(types).length,
      stats,
      missingIcons,
      aliasedIcons,
      excludedPoints,
      ignoredTileRegions,
      ignoredTileCount,
      satelliteTileCount: satelliteTiles.tileIndex.length,
      novecentoFontsIncluded: includeLicensedNovecento,
      akeDataRoot,
      gameDataRoot,
      gameBoundaryStats,
      sourceFiles,
      sourceReadOnly: true,
      cloudflareChanges: false,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      releaseId,
      gameVersion,
      gameBuild,
      gameVersionLabel,
      launcherVersion: resolvedGameVersion.launcher,
      versionSource: resolvedGameVersion.source,
      buildSource: resolvedGameVersion.buildSource,
      tiles: tileIndex.length,
      points: pointIds.size,
      missingIcons: missingIcons.length,
      aliasedIcons,
      typeCount: Object.keys(types).length,
      excludedPoints,
      ignoredTileRegions,
      gameBoundaryStats,
      novecentoFontsIncluded: includeLicensedNovecento,
      output: publicOutput,
    },
    null,
    2,
  ),
);
