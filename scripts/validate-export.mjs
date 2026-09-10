import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const SCHEMA_VERSION = 1;
const publicRoot = path.join(root, 'public');
const fail = (message) => { throw new Error(message); };
const warnings = [];
const warn = (message) => { warnings.push(message); console.warn(`Warning: ${message}`); };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = async (filename) => JSON.parse(await fs.readFile(filename, 'utf8'));
const validatePath = (value) => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('/oem/') || value.split('/').includes('..') || /^[a-z][a-z\d+.-]*:/i.test(value)) {
    fail(`Unsafe resource path: ${value}`);
  }
};
const readRef = async (ref) => {
  validatePath(ref.path);
  const filename = path.join(publicRoot, ref.path);
  const bytes = await fs.readFile(filename);
  if (bytes.byteLength !== ref.bytes) fail(`Resource size mismatch: ${ref.path}`);
  if (hash(bytes) !== ref.sha256) fail(`Resource hash mismatch: ${ref.path}`);
  return JSON.parse(bytes.toString());
};
const decodePoint = (raw, region, shardPath) => {
  if (!Array.isArray(raw) && raw && raw.position && raw.raw) return raw;
  const value = Array.isArray(raw)
    ? { id: raw[0], z: raw[1], x: raw[2], y: raw[3], tier: raw[4], type: raw[5] }
    : raw;
  if (value?.id == null) return undefined;
  const x = value.x ?? value.pos?.[1] ?? 0;
  const z = value.z ?? value.pos?.[0] ?? 0;
  const y = value.y ?? value.pos?.[2] ?? 0;
  const tier = value.tier ?? 0;
  const subregionId = value.subregId ?? path.basename(shardPath, '.json');
  const transform = region.subregions.find((entry) => entry.id === subregionId)?.gameTransform ?? region.gameTransform;
  const scale = 2 ** region.maxNativeZoom;
  return {
    id: String(value.id), regionId: region.id, subregionId, type: value.type ?? '', tier,
    raw: { x: (x - transform.offsetX) / transform.scaleX, y, z: (z - transform.offsetZ) / transform.scaleZ },
    position: { regionId: region.id, subregionId, x: x * scale, z: z * scale,
      floorId: tier === 0 ? 'M' : `${tier < 0 ? 'B' : 'L'}${Math.abs(Math.trunc(tier))}` },
  };
};
const validateFileRef = async (ref) => {
  validatePath(ref.path);
  const bytes = await fs.readFile(path.join(publicRoot, ref.path));
  if (bytes.byteLength !== ref.bytes) fail(`Resource size mismatch: ${ref.path}`);
  if (hash(bytes) !== ref.sha256) fail(`Resource hash mismatch: ${ref.path}`);
};
const walk = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filename) : [filename];
  }))).flat();
};

const channel = await readJson(path.join(publicRoot, 'channels/stable.json'));
const manifest = await readRef(channel.manifest);
if (manifest.schemaVersion !== SCHEMA_VERSION || !/^\d+_\d+_\d+$/.test(manifest.gameVersion) ||
  !/^atlos-[0-9a-f]{7}$/.test(manifest.releaseId) ||
  manifest.releaseId !== path.basename(path.dirname(channel.manifest.path))) fail('Channel and manifest release mismatch');
const releaseRoot = `${manifest.gameVersion}/${manifest.releaseId}`;
const markerRoot = `/marker/${releaseRoot}`;
const mapRoot = `/map/${releaseRoot}`;
const tileRootPath = `/tiles/${manifest.gameVersion}`;
const requirePath = (value, expected) => {
  if (value !== expected) fail(`Unexpected versioned resource path: ${value}`);
};
const requirePrefix = (value, expected) => {
  if (!value.startsWith(`${expected}/`)) fail(`Unexpected versioned resource path: ${value}`);
};
if (Object.prototype.hasOwnProperty.call(manifest, 'attribution')) fail('Legacy attribution text must not be published');
if (!manifest.controls?.[manifest.fallbackLocale]?.layerSelect ||
  !manifest.controls[manifest.fallbackLocale].brandName ||
  !manifest.controls[manifest.fallbackLocale].termsOfService) fail('Fallback control messages are unavailable');
await Promise.all((manifest.fonts ?? []).map((font) => validateFileRef(font)));
if (manifest.fontLicense) await validateFileRef(manifest.fontLicense);
await Promise.all((manifest.fontLicenses ?? []).map((license) => validateFileRef(license)));
const expectedFontFiles = new Map([
  ['HMSans_EN', 'HMSans.woff2'],
  ['Novecento Wide Bold', 'Novecento-WideBold.woff2'],
  ['Novecento Wide DemiBold', 'Novecento-WideDemiBold.woff2'],
  ['Novecento Wide Medium', 'Novecento-WideMedium.woff2'],
  ['Novecento Cyrillic DemiBold', 'NWDemiBold+Grek+Cyrl.woff2'],
  ['Novecento Cyrillic Medium', 'NWMed+Grek+Cyrl.woff2'],
  ['Novecento Vietnamese DemiBold', 'NWBold+Viet.woff2'],
  ['Novecento Vietnamese Medium', 'NWMed+Viet.woff2'],
]);
for (const font of manifest.fonts ?? []) {
  if (expectedFontFiles.get(font.family) !== font.path.split('/').at(-1)) {
    warn(`Unexpected font file for ${font.family}: ${font.path}`);
  }
}
const exportedFontFamilies = new Set((manifest.fonts ?? []).map((font) => font.family));
const novecentoFamilies = [...expectedFontFiles.keys()].filter((family) => family.startsWith('Novecento'));
if (novecentoFamilies.some((family) => exportedFontFamilies.has(family)) &&
  novecentoFamilies.some((family) => !exportedFontFamilies.has(family))) {
  warn('Novecento export is missing a script-specific Wide face');
}
requirePath(manifest.types.path, `${markerRoot}/type.json`);
const types = await readRef(manifest.types);
if (Object.hasOwn(types, '__unknown') || Object.values(types).some((type) =>
  type.category?.main === 'unknown' || type.category?.sub === 'unknown')) fail('Unknown marker types must not be published');
if (types.npc?.category?.main !== 'npc' || types.files?.category?.main !== 'files') {
  fail('Aggregated npc/files marker types are unavailable');
}
await Promise.all(Object.values(types).flatMap((type) => [type.icon, type.subIcon].filter(Boolean)).map(async (iconPath) => {
  validatePath(iconPath);
  requirePrefix(iconPath, '/marker/assets');
  await fs.access(path.join(publicRoot, iconPath));
}));
if (manifest.pointIndex) requirePath(manifest.pointIndex.path, `${markerRoot}/point-index.json`);
const pointIndex = manifest.pointIndex ? await readRef(manifest.pointIndex) : {};
const localeEntries = Object.entries(manifest.locales);
if (!localeEntries.some(([locale]) => locale === manifest.fallbackLocale)) fail('Fallback locale is unavailable');
if (localeEntries.some(([locale]) => {
  const messages = manifest.controls[locale];
  return !messages?.layerSelect || !messages.zoomIn || !messages.zoomOut || !messages.brandName || !messages.termsOfService;
})) warn('A locale is missing control messages; clients will use the fallback locale');
for (const [locale, ref] of localeEntries) requirePath(ref.path, `${markerRoot}/locales/${locale}/places.json`);
await Promise.all(localeEntries.map(([, ref]) => readRef(ref)));

const ids = new Set();
let pointCount = 0;
let coveredTiles = 0;
for (const region of manifest.regions) {
  const floorIds = new Set(region.floors.map((floor) => floor.id));
  const subregionIds = new Set(region.subregions.map((subregion) => subregion.id));
  if (!floorIds.has('M')) fail(`Region has no main floor: ${region.id}`);
  if (!region.locales?.[manifest.fallbackLocale]) fail(`Region has no fallback name: ${region.id}`);
  if (subregionIds.size !== region.subregions.length) fail(`Duplicate subregion ID in ${region.id}`);
  for (const subregion of region.subregions) {
    if (subregion.bounds && (subregion.bounds.length !== 2 || subregion.bounds.flat().some((value) => !Number.isFinite(value)))) {
      fail(`Invalid subregion bounds: ${subregion.id}`);
    }
    if (region.subregions.length > 1 && !subregion.locales?.[manifest.fallbackLocale]?.name) {
      fail(`Subregion has no fallback name: ${subregion.id}`);
    }
    if (subregion.gameTransform && (![subregion.gameTransform.scaleX, subregion.gameTransform.scaleZ,
      subregion.gameTransform.offsetX, subregion.gameTransform.offsetZ].every(Number.isFinite) ||
      subregion.gameTransform.scaleX === 0 || subregion.gameTransform.scaleZ === 0)) {
      fail(`Invalid subregion game transform: ${subregion.id}`);
    }
  }
  if (!region.gameTransform || ![region.gameTransform.scaleX, region.gameTransform.scaleZ,
    region.gameTransform.offsetX, region.gameTransform.offsetZ].every(Number.isFinite) ||
    region.gameTransform.scaleX === 0 || region.gameTransform.scaleZ === 0) {
    fail(`Invalid region game transform: ${region.id}`);
  }
  for (const floor of region.floors) requirePrefix(floor.tileTemplate, `${tileRootPath}/${region.id}`);
  if (region.labels) {
    requirePath(region.labels.path, `${mapRoot}/labels/${region.id}.json`);
    await readRef(region.labels);
  }
  if (region.boundaries) {
    requirePath(region.boundaries.path, `${mapRoot}/boundaries/${region.id}.json`);
    await readRef(region.boundaries);
  }
  if (region.gameBoundaries) {
    requirePath(region.gameBoundaries.path, `${mapRoot}/boundaries/${region.id}.game.json`);
    const gameBoundaries = await readRef(region.gameBoundaries);
    if (!Array.isArray(gameBoundaries) || gameBoundaries.some((boundary) =>
      !boundary?.id || !Array.isArray(boundary.rings) || boundary.rings.some((ring) =>
        !Array.isArray(ring) || ring.length < 3 || ring.some((position) =>
          position?.regionId !== region.id || !Number.isFinite(position.x) || !Number.isFinite(position.z))))
    ) fail(`Invalid game boundary data: ${region.id}`);
  }
  for (const ref of region.points) {
    requirePrefix(ref.path, `${markerRoot}/points`);
    const rawPoints = await readRef(ref);
    if (!Array.isArray(rawPoints)) fail(`Point shard is not an array: ${ref.path}`);
    const points = rawPoints.map((point) => decodePoint(point, region, ref.path)).filter(Boolean);
    for (const point of points) {
      if (ids.has(point.id)) fail(`Duplicate point ID: ${point.id}`);
      if (!/^\d+$/.test(point.id) || BigInt(point.id) >= (1n << 36n)) fail(`Point ID cannot use an OEM short link: ${point.id}`);
      ids.add(point.id);
      pointCount += 1;
      if (point.regionId !== region.id) fail(`Point region mismatch: ${point.id}`);
      if (!subregionIds.has(point.subregionId)) fail(`Point subregion missing: ${point.id}/${point.subregionId}`);
      if (!types[point.type]) fail(`Point type missing: ${point.type}`);
      if (!floorIds.has(point.position.floorId)) fail(`Point floor missing: ${point.id}/${point.position.floorId}`);
      if (![point.raw.x, point.raw.y, point.raw.z, point.position.x, point.position.z].every(Number.isFinite)) fail(`Point coordinates invalid: ${point.id}`);
      const transform = region.subregions.find((subregion) => subregion.id === point.subregionId)?.gameTransform ?? region.gameTransform;
      const scale = 2 ** region.maxNativeZoom;
      if (Math.abs(point.position.x / scale - (point.raw.x * transform.scaleX + transform.offsetX)) > 1e-5 ||
        Math.abs(point.position.z / scale - (point.raw.z * transform.scaleZ + transform.offsetZ)) > 1e-5) {
        fail(`Point coordinate transform mismatch: ${point.id}`);
      }
      if (pointIndex[point.id] !== ref.path) fail(`Point index mismatch: ${point.id}`);
    }
  }
  for (const [zoom, floors] of Object.entries(region.coverage)) {
    for (const [floorId, rows] of Object.entries(floors)) {
      if (!floorIds.has(floorId)) fail(`Coverage floor missing: ${region.id}/${floorId}`);
      const floor = region.floors.find((entry) => entry.id === floorId);
      const template = floor.tileTemplate;
      const versionRows = floor.tileVersions?.[zoom] ?? {};
      if (Object.keys(versionRows).length !== Object.keys(rows).length) fail(`Tile version rows mismatch: ${region.id}/${floorId}/${zoom}`);
      for (const [tileY, ranges] of Object.entries(rows)) {
        if (ranges.length % 2 !== 0) fail(`Invalid coverage ranges: ${region.id}/${floorId}/${zoom}/${tileY}`);
        const versions = versionRows[tileY] ?? [];
        let versionIndex = 0;
        for (let index = 0; index < ranges.length; index += 2) {
          for (let tileX = ranges[index]; tileX <= ranges[index + 1]; tileX += 1) {
            const tilePath = template.replace('{z}', zoom).replace('{x}', String(tileX)).replace('{y}', tileY);
            validatePath(tilePath);
            const tileBytes = await fs.readFile(path.join(publicRoot, tilePath));
            if (versions[versionIndex] !== hash(tileBytes).slice(0, 7)) {
              fail(`Tile version mismatch: ${region.id}/${floorId}/${zoom}/${tileX}/${tileY}`);
            }
            versionIndex += 1;
            coveredTiles += 1;
          }
        }
        if (versions.length !== versionIndex) fail(`Tile version count mismatch: ${region.id}/${floorId}/${zoom}/${tileY}`);
      }
    }
  }
}
if (Object.keys(pointIndex).length !== pointCount) fail('Point index cardinality mismatch');

const tileRoot = path.join(publicRoot, tileRootPath);
const tileFiles = (await walk(tileRoot)).filter((filename) => filename.endsWith('.webp'));
if (tileFiles.length !== coveredTiles) fail(`Tile coverage mismatch: ${tileFiles.length} files, ${coveredTiles} indexed`);
const tileIndex = await Promise.all(tileFiles.map(async (filename) => {
  const [regionId, zoom, tileX, tileName] = path.relative(tileRoot, filename).split(path.sep);
  return { relative: `${regionId}/${zoom}/${tileX}_${tileName}`, hash: hash(await fs.readFile(filename)) };
}));
tileIndex.sort((left, right) => left.relative.localeCompare(right.relative));
const tileContentHash = hash(JSON.stringify(tileIndex));
for (const namespace of ['tiles', 'marker', 'map']) {
  const versions = await fs.readdir(path.join(publicRoot, namespace), { withFileTypes: true });
  const versionDirectories = versions.filter((entry) => entry.isDirectory() && entry.name !== 'assets').map((entry) => entry.name);
  if (!versionDirectories.includes(manifest.gameVersion)) {
    fail(`Missing ${namespace} version directory: ${manifest.gameVersion}`);
  }
  if (versionDirectories.length > 1) {
    warn(`Historical ${namespace} version directories are present: ${versionDirectories.join(', ')}`);
  }
}
for (const namespace of ['marker', 'map']) {
  const releases = await fs.readdir(path.join(publicRoot, namespace, manifest.gameVersion), { withFileTypes: true });
  const versionReleases = releases.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  if (!versionReleases.includes(manifest.releaseId)) {
    fail(`Missing ${namespace} release directory: ${manifest.releaseId}`);
  }
  if (versionReleases.length > 1) {
    warn(`Historical ${namespace} release directories are present: ${versionReleases.join(', ')}`);
  }
}
const releaseDirectories = (await fs.readdir(path.join(publicRoot, 'releases'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
if (!releaseDirectories.includes(manifest.releaseId)) {
  fail(`Missing release directory: ${manifest.releaseId}`);
}
if (releaseDirectories.length > 1) {
  warn(`Historical release directories are present: ${releaseDirectories.join(', ')}`);
}

const report = await readJson(path.join(root, 'artifacts/export-report.json'));
if (report.releaseId !== manifest.releaseId || report.gameVersion !== manifest.gameVersion || report.tileContentHash !== tileContentHash ||
  report.tileCount !== tileFiles.length || report.pointCount !== pointCount || report.typeCount !== Object.keys(types).length ||
  !report.sourceReadOnly || report.cloudflareChanges) {
  fail('Export report does not match validated content');
}
if (report.missingIcons?.length) warn(`Unresolved Atlos icons remain: ${report.missingIcons.join(', ')}`);
const expectedExclusions = new Map([
  ['2800000983', 'missing-type'],
]);
for (const excluded of report.excludedPoints ?? []) {
  if (excluded.type === 'cv_wall') expectedExclusions.set(excluded.id, 'unsupported-collision-volume');
  if (expectedExclusions.get(excluded.id) !== excluded.reason) fail(`Unexpected excluded marker point: ${excluded.id}`);
  expectedExclusions.delete(excluded.id);
}
if (expectedExclusions.size || report.excludedPoints?.length !== 2) warn('Marker exclusion set differs from the historical baseline');
const novecentoFontsIncluded = Boolean(manifest.fonts?.some((font) => font.family.startsWith('Novecento')));
if (report.novecentoFontsIncluded !== novecentoFontsIncluded) fail('Font export report does not match manifest');

console.log(JSON.stringify({ releaseId: manifest.releaseId, gameVersion: manifest.gameVersion, regions: manifest.regions.length,
  locales: localeEntries.length, points: pointCount, tiles: tileFiles.length, cloudflareChanges: false, warnings: warnings.length }, null, 2));
