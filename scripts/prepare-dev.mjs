import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(root, 'public');
const channelPath = path.join(root, 'public/channels/stable.json');

const hasPreparedData = async () => {
  try {
    const channel = JSON.parse(await fs.readFile(channelPath, 'utf8'));
    const manifestPath = channel?.manifest?.path;
    if (typeof manifestPath !== 'string' || !manifestPath.startsWith('/')) return false;
    const manifest = JSON.parse(await fs.readFile(path.join(publicRoot, manifestPath.slice(1)), 'utf8'));
    const hasPlane = (value) => value && Number.isFinite(value.x) && Number.isFinite(value.z) && !('y' in value);
    const hasTransform = (value) => value && [value.scaleX, value.scaleZ, value.offsetX, value.offsetZ].every(Number.isFinite)
      && value.scaleX !== 0 && value.scaleZ !== 0;
    const references = [
      manifest.types,
      manifest.pointIndex,
      manifest.fontLicense,
      ...(manifest.fonts ?? []),
      ...(manifest.fontLicenses ?? []),
      ...Object.values(manifest.locales ?? {}),
      ...(manifest.points ?? []),
      ...(manifest.regions ?? []).flatMap((region) => [
        ...(region.points ?? []), region.labels, region.boundaries, region.gameBoundaries,
      ]),
    ].filter((reference) => reference && typeof reference.path === 'string');
    const resourcesExist = await Promise.all(references.map(async (reference) => {
      if (!reference.path.startsWith('/') || reference.path.includes('{')) return true;
      try {
        await fs.access(path.join(publicRoot, reference.path.slice(1)));
        return true;
      } catch {
        return false;
      }
    }));
    return manifest.schemaVersion === 1 && Array.isArray(manifest.regions) && manifest.regions.length > 0
      && manifest.regions.every((region) => hasPlane(region.boundsOffset) && hasPlane(region.initialView)
        && hasTransform(region.gameTransform) && Array.isArray(region.subregions)
        && region.subregions.every((subregion) => !subregion.gameTransform || hasTransform(subregion.gameTransform)))
      && resourcesExist.every(Boolean);
  } catch {
    return false;
  }
};

if (!await hasPreparedData()) {
  console.log('Local map data is missing; exporting it once for the dev server.');
  await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts/export-atlos.mjs'), '--include-licensed-novecento'], {
      cwd: root,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Development data export failed (${signal ?? code ?? 'unknown'})`));
    });
  });
}
