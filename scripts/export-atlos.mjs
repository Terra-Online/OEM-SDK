import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveGameVersion } from './game-version.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const SCHEMA_VERSION = 1;
const args = process.argv.slice(2);
const sourceArg = args.find((argument) => !argument.startsWith('--'));
const source = path.resolve(sourceArg ?? path.join(root, '../Atlos/talos'));
const resolvedGameVersion = await resolveGameVersion(args);
const gameVersion = resolvedGameVersion.path;
const releasePlaceholder = '__release__';
const publicOutput = path.join(root, 'public');
const output = path.join(root, '.export-tmp');
await fs.rm(output, { recursive: true, force: true });
const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const pointIdLimit = 1n << 36n;
const sourceFiles = {};
const includeLicensedNovecento = process.env.OEM_INCLUDE_LICENSED_NOVECENTO === '1' || args.includes('--include-licensed-novecento');
const read = async (relative) => {
  const bytes = await fs.readFile(path.join(source, relative));
  sourceFiles[relative] = sha256(bytes);
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
const walk = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.sort((left, right) => left.name.localeCompare(right.name)).map(async (entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filename) : [filename];
  }));
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
const regionNames = { Valley_4: '四号谷地', Wuling: '武陵', Dijiang: '帝江号', Weekraid_1: 'Etchspace Salvage' };
const labels = await read('src/data/map/label/labels.json');
const subregions = [...await read('src/data/map/subregionData/VL.json'), ...await read('src/data/map/subregionData/WL.json')];
const subregionsById = new Map(subregions.map((subregion) => [subregion.id, subregion]));
const discoveredTileFiles = (await walk(path.join(source, 'public/clips'))).filter((filename) => filename.endsWith('.webp'));
const activeRegionIds = new Set(Object.keys(regionSource));
const tileFiles = discoveredTileFiles.filter((filename) => activeRegionIds.has(path.relative(path.join(source, 'public/clips'), filename).split(path.sep)[0]));
const ignoredTileRegions = [...new Set(discoveredTileFiles.filter((filename) => !activeRegionIds.has(path.relative(path.join(source, 'public/clips'), filename).split(path.sep)[0]))
  .map((filename) => path.relative(path.join(source, 'public/clips'), filename).split(path.sep)[0]))];
const tileIndex = [];
const coverage = {};
const tileVersions = {};
for (const filename of tileFiles) {
  const relative = path.relative(path.join(source, 'public/clips'), filename);
  if (!/^[^/]+\/\d+\/-?\d+_-?\d+(?:_[a-z]\d+)?\.webp$/.test(relative)) continue;
  const content = await fs.readFile(filename);
  const tileHash = sha256(content);
  tileIndex.push({ relative, hash: tileHash });
  const [regionId, zoom, tileName] = relative.split('/');
  const match = tileName.match(/^(-?\d+)_(-?\d+)(?:_([a-z]\d+))?\.webp$/);
  const [, tileX, tileY, suffix] = match;
  const floorId = suffix?.toUpperCase() ?? 'M';
  const rows = ((coverage[regionId] ??= {})[zoom] ??= {})[floorId] ??= {};
  (rows[tileY] ??= []).push(Number(tileX));
  const versionRows = ((tileVersions[regionId] ??= {})[zoom] ??= {})[floorId] ??= {};
  (versionRows[tileY] ??= {})[tileX] = tileHash.slice(0, 7);
  const floorSuffix = floorId === 'M' ? '' : `_${floorId.toLowerCase()}`;
  const target = `tiles/${gameVersion}/${regionId}/${zoom}/${tileX}/${tileY}${floorSuffix}.webp`;
  await write(target, content);
}
const tileContentHash = sha256(JSON.stringify(tileIndex));
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
const floorTileVersions = (regionId, floorId) => Object.fromEntries(Object.entries(tileVersions[regionId] ?? {})
  .filter(([, floors]) => floors[floorId])
  .map(([zoom, floors]) => [zoom, floors[floorId]]));
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
  fonts.push({ path: fontPath, sha256: digest, bytes: content.byteLength, family, weight, weightRange, style: 'normal' });
};
// HarmonyOS Sans is the Atlos Latin/UI face and may be redistributed with the
// software when its license notice is retained. It is a variable font, so keep
// the complete weight axis available to consumers.
await exportFont({ relative: 'src/assets/fonts/Harmony/HMSans.woff2', family: 'HMSans_EN', weight: 400, weightRange: [100, 900] });
const harmonyLicenseRelative = 'src/assets/fonts/LICENSE/Harmony OS Sans/Harmony OS Sans - License.txt';
const harmonyLicenseContent = await fs.readFile(path.join(source, harmonyLicenseRelative));
const harmonyLicenseHash = sha256(harmonyLicenseContent);
sourceFiles[harmonyLicenseRelative] = harmonyLicenseHash;
const harmonyLicensePath = `/fonts/harmony/${harmonyLicenseHash}/LICENSE.txt`;
await write(harmonyLicensePath.slice(1), harmonyLicenseContent);
fontLicenses.push({ path: harmonyLicensePath, sha256: harmonyLicenseHash, bytes: harmonyLicenseContent.byteLength });

if (includeLicensedNovecento) {
  // These are the Wide faces used by Atlos. The Cyrillic and Vietnamese files
  // intentionally retain Atlos' separate family names so browser fallback can
  // select the glyph-complete face for each script.
  const novecentoFiles = [
    { filename: 'Novecento-WideBold.woff2', family: 'Novecento Bold', weight: 700 },
    { filename: 'Novecento-WideDemiBold.woff2', family: 'Novecento DemiBold', weight: 600 },
    { filename: 'Novecento-WideMedium.woff2', family: 'Novecento Medium', weight: 500 },
    { filename: 'NWDemiBold+Grek+Cyrl.woff2', family: 'Novecento Cyrillic DemiBold', weight: 600 },
    { filename: 'NWMed+Grek+Cyrl.woff2', family: 'Novecento Cyrillic Medium', weight: 500 },
    { filename: 'NWBold+Viet.woff2', family: 'Novecento Vietnamese DemiBold', weight: 600 },
    { filename: 'NWMed+Viet.woff2', family: 'Novecento Vietnamese Medium', weight: 500 },
  ];
  for (const font of novecentoFiles) {
    await exportFont({ relative: `src/assets/fonts/Novecento/${font.filename}`, family: font.family, weight: font.weight, namespace: 'novecento' });
  }
  const licenseRelative = 'src/assets/fonts/LICENSE/Novecento Sans/Synthview Type Design - Webfont License 1.0.0.txt';
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
    return (await versionedObject('marker', `assets/${requested}.webp`, content)).path;
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
  types[key] = { key, category: type.category, noFrame: type.noFrame, icon: await icon(type.icon ?? key),
    subIcon: type.subIcon ? await icon(type.subIcon, true) : undefined };
}
types.npc = { key: 'npc', category: { main: 'npc', sub: 'npc' }, icon: await icon('mission_npc') };
types.files = { key: 'files', category: { main: 'files', sub: 'archives' }, icon: await icon('prts_read_note') };
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
for (const [id, config] of Object.entries(regionSource)) {
  const scale = 2 ** config.maxZoom;
  const boundsOffset = config.boundsOffset ?? { x: 0, y: 0 };
  const region = {
    id, name: regionNames[id] ?? id, locales: {}, dimensions: config.dimensions, boundsOffset,
    tileSize: config.tileSize, minZoom: 0, maxNativeZoom: config.maxZoom,
    maxZoom: config.maxZoom + (['Valley_4', 'Wuling'].includes(id) ? 1.5 : 1),
    initialView: { regionId: id, floorId: 'M', x: boundsOffset.x + config.dimensions[0] / 2 + config.initialOffset.x,
      y: boundsOffset.y + config.dimensions[1] / 2 + config.initialOffset.y, zoom: config.initialZoom },
    floors: ['M', ...config.layers ?? []].map((floorId) => ({
      id: floorId,
      tileTemplate: `/tiles/${gameVersion}/${id}/{z}/{x}/{y}${floorId === 'M' ? '' : `_${floorId.toLowerCase()}`}.webp`,
      tileVersions: floorTileVersions(id, floorId),
    })),
    subregions: config.subregions.map((subregionId) => {
      const subregion = subregionsById.get(subregionId);
      return { id: subregionId, key: subregion?.name ?? subregionId, bounds: subregion?.bounds };
    }),
    points: [], coverage: coverage[id] ?? {},
  };
  for (const subregionId of config.subregions) {
    const raw = await read(`src/data/marker/data/${subregionId}.json`);
    const normalized = raw.map((entry) => {
      const value = Array.isArray(entry) ? { id: entry[0], z: entry[1], x: entry[2], y: entry[3], tier: entry[4], type: entry[5] } : entry;
      return { ...value, id: String(value.id), z: value.z ?? value.pos?.[0] ?? 0, x: value.x ?? value.pos?.[1] ?? 0,
        y: value.y ?? value.pos?.[2] ?? 0, tier: value.tier ?? 0, subregId: value.subregId ?? subregionId, type: value.type ?? '' };
    });
    const corrected = applyMarkerOverrides(normalized, overrides, { subregionId });
    const points = corrected.flatMap((point) => {
      if (!point.id || pointIds.has(point.id)) throw new Error(`Duplicate/invalid point ID: ${point.id}`);
      if (!/^\d+$/.test(point.id) || BigInt(point.id) >= pointIdLimit) throw new Error(`Point ID cannot use an OEM short link: ${point.id}`);
      if (![point.x, point.y, point.z, point.tier].every(Number.isFinite)) throw new Error(`Invalid coordinates: ${point.id}`);
      if (point.id === '2800000983' || point.type === 'cv_wall') {
        excludedPoints.push({ id: point.id, type: point.type || null,
          reason: point.type === 'cv_wall' ? 'unsupported-collision-volume' : 'missing-type' });
        return [];
      }
      const type = normalizePointType(point);
      if (!types[type]) throw new Error(`Normalized marker type is unavailable: ${point.type} -> ${type}`);
      pointIds.add(point.id);
      const floorId = point.tier === 0 ? 'M' : `${point.tier < 0 ? 'B' : 'L'}${Math.abs(point.tier)}`;
      return [{ id: point.id, regionId: id, subregionId: point.subregId, type, tier: point.tier,
        raw: { x: point.x, y: point.y, z: point.z }, position: { regionId: id, x: point.x * scale, y: -point.z * scale, floorId } }];
    });
    const ref = await versionedObject('marker', `points/${subregionId}.json`, points);
    region.points.push(ref);
    for (const point of points) pointIndex[point.id] = ref.path;
    stats[subregionId] = { source: raw.length, afterOverrides: corrected.length, exported: points.length };
  }
  const code = regionCodes[id];
  const regionLabels = Object.values(labels.regions[code]?.labels ?? {}).map((label) => ({
    id: label.id, type: label.type,
    position: { regionId: id, x: label.point[0], y: label.point[1] },
    textKey: `${code}.sub.${label.sub === '__root__' ? '' : `${label.sub}.`}${label.type === 'sub' ? 'name' : `site.${label.site}`}`,
  }));
  region.labels = await versionedObject('map', `labels/${id}.json`, regionLabels);
  const boundaries = subregions.filter((subregion) => config.subregions.includes(subregion.id)).map((subregion) => {
    const rings = subregion.polygon?.length
      ? subregion.polygon
      : subregion.bounds?.length >= 2
        ? [[
            [subregion.bounds[0][0], subregion.bounds[0][1]],
            [subregion.bounds[1][0], subregion.bounds[0][1]],
            [subregion.bounds[1][0], subregion.bounds[1][1]],
            [subregion.bounds[0][0], subregion.bounds[1][1]],
          ]]
        : [];
    return { id: subregion.id, rings: rings.map((ring) => ring.map(([pixelX, pixelY]) => ({ regionId: id, x: pixelX, y: pixelY }))) };
  }).filter((boundary) => boundary.rings.length);
  region.boundaries = await versionedObject('map', `boundaries/${id}.json`, boundaries);
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
  const layerLabel = uiMessages.mapControls?.layerSelect;
  const zoomInLabel = uiMessages.settings?.shortcuts?.zoomIn;
  const zoomOutLabel = uiMessages.settings?.shortcuts?.zoomOut;
  const brandName = uiMessages.meta?.title;
  const termsOfService = locale === 'en-US' ? 'Terms of Services' : locale === 'zh-CN' ? '服务条款' : locale === 'zh-HK' ? '服務條款' : uiMessages.tos?.title;
  if (![layerLabel, zoomInLabel, zoomOutLabel, brandName, termsOfService].every((value) => typeof value === 'string' && value.length > 0)) {
    throw new Error(`Missing Atlos control messages for locale: ${locale}`);
  }
  controls[locale] = {
    layerSelect: layerLabel,
    zoomIn: zoomInLabel,
    zoomOut: zoomOutLabel,
    brandName,
    termsOfService,
  };
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
      if (typeof name === 'string') localized[locale] = { name, short: typeof short === 'string' && short.trim() ? short : subregion.key };
    }
    if (Object.keys(localized).length) subregion.locales = localized;
  }
}
const pointIndexRef = await versionedObject('marker', 'point-index.json', pointIndex);
const typeRef = await versionedObject('marker', 'type.json', types);
const releaseId = `atlos-${sha256(JSON.stringify({ schemaVersion: SCHEMA_VERSION, gameVersion, regions, types: typeRef, pointIndex: pointIndexRef, locales, controls, fonts, fontLicense, fontLicenses, tileContentHash })).slice(0, 7)}`;
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
for (const value of [regions, types, pointIndex, typeRef, pointIndexRef, locales]) finalizeReleasePaths(value);
for (const [name, value, ref] of [['type.json', types, typeRef], ['point-index.json', pointIndex, pointIndexRef]]) {
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
const manifest = {
  schemaVersion: SCHEMA_VERSION, gameVersion, releaseId, generatedAt: new Date().toISOString(), defaultRegionId: 'Valley_4',
  regions, types: typeRef, pointIndex: pointIndexRef, fonts, fontLicense, fontLicenses, locales, controls, fallbackLocale: 'en-US',
  source: { repository: 'Atlos', commit: execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    usage: 'Local development snapshot only. SDK AGPL-3.0; asset redistribution permission must be confirmed separately.' },
};
const manifestPath = `/releases/${releaseId}/manifest.json`;
let manifestBytes = JSON.stringify(manifest);
try { manifestBytes = await fs.readFile(path.join(publicOutput, manifestPath.slice(1))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await write(manifestPath.slice(1), manifestBytes);
await write('channels/stable.json', JSON.stringify({ manifest: { path: manifestPath, sha256: sha256(manifestBytes), bytes: Buffer.byteLength(manifestBytes) } }));
await fs.rm(publicOutput, { recursive: true, force: true });
await fs.rename(output, publicOutput);
await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
await fs.writeFile(path.join(root, 'artifacts/export-report.json'), JSON.stringify({ releaseId, gameVersion,
  launcherVersion: resolvedGameVersion.launcher, versionSource: resolvedGameVersion.source, tileContentHash, tileCount: tileIndex.length,
  pointCount: pointIds.size, typeCount: Object.keys(types).length, stats, missingIcons, aliasedIcons, excludedPoints, ignoredTileRegions,
  ignoredTileCount: discoveredTileFiles.length - tileFiles.length, novecentoFontsIncluded: includeLicensedNovecento,
  sourceFiles, sourceReadOnly: true, cloudflareChanges: false }, null, 2));
console.log(JSON.stringify({ releaseId, gameVersion, launcherVersion: resolvedGameVersion.launcher,
  versionSource: resolvedGameVersion.source, tiles: tileIndex.length, points: pointIds.size, missingIcons: missingIcons.length, aliasedIcons,
  typeCount: Object.keys(types).length, excludedPoints, ignoredTileRegions,
  novecentoFontsIncluded: includeLicensedNovecento, output: publicOutput }, null, 2));
