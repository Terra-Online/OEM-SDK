import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const SCHEMA_VERSION = 1;
const publicRoot = path.join(root, 'public');
const fail = (message) => { throw new Error(message); };
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
  manifest.releaseId !== path.basename(path.dirname(channel.manifest.path))) fail('Channel and manifest release mismatch');
const markerRoot = `/marker/${manifest.gameVersion}`;
const mapRoot = `/map/${manifest.gameVersion}`;
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
requirePath(manifest.types.path, `${markerRoot}/types.json`);
const types = await readRef(manifest.types);
await Promise.all(Object.values(types).flatMap((type) => [type.icon, type.subIcon].filter(Boolean)).map(async (iconPath) => {
  validatePath(iconPath);
  requirePrefix(iconPath, `${markerRoot}/assets`);
  await fs.access(path.join(publicRoot, iconPath));
}));
if (manifest.pointIndex) requirePath(manifest.pointIndex.path, `${markerRoot}/point-index.json`);
const pointIndex = manifest.pointIndex ? await readRef(manifest.pointIndex) : {};
const localeEntries = Object.entries(manifest.locales);
if (!localeEntries.some(([locale]) => locale === manifest.fallbackLocale)) fail('Fallback locale is unavailable');
if (localeEntries.some(([locale]) => {
  const messages = manifest.controls[locale];
  return !messages?.layerSelect || !messages.zoomIn || !messages.zoomOut || !messages.brandName || !messages.termsOfService;
})) fail('A locale is missing control messages');
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
  for (const ref of region.points) {
    requirePrefix(ref.path, `${markerRoot}/points`);
    const points = await readRef(ref);
    for (const point of points) {
      if (ids.has(point.id)) fail(`Duplicate point ID: ${point.id}`);
      if (!/^\d+$/.test(point.id) || BigInt(point.id) >= (1n << 36n)) fail(`Point ID cannot use an OEM short link: ${point.id}`);
      ids.add(point.id);
      pointCount += 1;
      if (point.regionId !== region.id) fail(`Point region mismatch: ${point.id}`);
      if (!subregionIds.has(point.subregionId)) fail(`Point subregion missing: ${point.id}/${point.subregionId}`);
      if (!types[point.type]) fail(`Point type missing: ${point.type}`);
      if (!floorIds.has(point.position.floorId)) fail(`Point floor missing: ${point.id}/${point.position.floorId}`);
      if (![point.raw.x, point.raw.y, point.raw.z, point.position.x, point.position.y].every(Number.isFinite)) fail(`Point coordinates invalid: ${point.id}`);
      if (pointIndex[point.id] !== ref.path) fail(`Point index mismatch: ${point.id}`);
    }
  }
  for (const [zoom, floors] of Object.entries(region.coverage)) {
    for (const [floorId, rows] of Object.entries(floors)) {
      if (!floorIds.has(floorId)) fail(`Coverage floor missing: ${region.id}/${floorId}`);
      const template = region.floors.find((floor) => floor.id === floorId).tileTemplate;
      for (const [tileY, ranges] of Object.entries(rows)) {
        if (ranges.length % 2 !== 0) fail(`Invalid coverage ranges: ${region.id}/${floorId}/${zoom}/${tileY}`);
        for (let index = 0; index < ranges.length; index += 2) {
          for (let tileX = ranges[index]; tileX <= ranges[index + 1]; tileX += 1) {
            const tilePath = template.replace('{z}', zoom).replace('{x}', String(tileX)).replace('{y}', tileY);
            validatePath(tilePath);
            await fs.access(path.join(publicRoot, tilePath));
            coveredTiles += 1;
          }
        }
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
  if (versions.some((entry) => entry.isDirectory() && !/^\d+_\d+_\d+$/.test(entry.name))) fail(`Invalid ${namespace} version directory`);
}

const design = await readJson(path.join(root, 'config/cdn.design.json'));
if (Object.values(design.deploymentGuards).some(Boolean)) fail('A deployment guard unexpectedly enables external changes');
const report = await readJson(path.join(root, 'artifacts/export-report.json'));
if (report.releaseId !== manifest.releaseId || report.gameVersion !== manifest.gameVersion || report.tileContentHash !== tileContentHash ||
  report.tileCount !== tileFiles.length || report.pointCount !== pointCount || !report.sourceReadOnly || report.cloudflareChanges) {
  fail('Export report does not match validated content');
}
if (report.missingIcons.length) fail(`Unresolved Atlos icons remain: ${report.missingIcons.join(', ')}`);
if (report.novecentoFontsIncluded !== Boolean(manifest.fonts?.length)) fail('Font export report does not match manifest');

console.log(JSON.stringify({ releaseId: manifest.releaseId, gameVersion: manifest.gameVersion, regions: manifest.regions.length,
  locales: localeEntries.length, points: pointCount, tiles: tileFiles.length, cloudflareChanges: false }, null, 2));
