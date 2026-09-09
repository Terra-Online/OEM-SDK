import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const channelPath = path.join(root, 'public/channels/stable.json');

const hasPreparedData = async () => {
  try {
    const channel = JSON.parse(await fs.readFile(channelPath, 'utf8'));
    const manifestPath = channel?.manifest?.path;
    if (typeof manifestPath !== 'string' || !manifestPath.startsWith('/')) return false;
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'public', manifestPath.slice(1)), 'utf8'));
    return manifest.schemaVersion === 1 && manifest.regions?.every((region) =>
      region.gameTransform && region.subregions?.every((subregion) =>
        !subregion.gameTransform || subregion.gameTransform.scaleX !== 0 && subregion.gameTransform.scaleZ !== 0));
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
