import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));

await build({ root, publicDir: false });
await fs.mkdir(path.join(root, 'dist'), { recursive: true });
const demoIcons = [
  'favicon.svg',
  'favicon_dark.svg',
  'favicon.ico',
  'favicon_dark.ico',
  'apple-touch-icon.png',
  'apple-touch-icon_dark.png',
];
await Promise.all(demoIcons.map((filename) =>
  fs.copyFile(path.join(root, 'demo', filename), path.join(root, 'dist', filename)),
));
await Promise.all(['_headers'].map((filename) =>
  fs.copyFile(path.join(root, 'deploy', filename), path.join(root, 'dist', filename)),
));
await fs.mkdir(path.join(root, 'dist', 'demo', 'assets'), { recursive: true });
await fs.copyFile(path.join(root, 'examples', 'basic', 'custom-points.json'), path.join(root, 'dist', 'demo', 'assets', 'custom-points.json'));
await fs.copyFile(path.join(root, 'examples', 'assets', 'instance.webp'), path.join(root, 'dist', 'demo', 'assets', 'instance.webp'));
await fs.mkdir(path.join(root, 'dist', 'assets'), { recursive: true });
await fs.copyFile(path.join(root, 'examples', 'basic', 'custom-points.json'), path.join(root, 'dist', 'assets', 'custom-points.json'));
await fs.copyFile(path.join(root, 'examples', 'assets', 'instance.webp'), path.join(root, 'dist', 'assets', 'instance.webp'));

const dist = path.join(root, 'dist');
for (const namespace of ['channels', 'releases', 'marker', 'map', 'tiles', 'fonts']) {
  try {
    await fs.access(path.join(dist, namespace));
    throw new Error(`Demo build unexpectedly contains data namespace: ${namespace}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const demoAssets = path.join(dist, 'demo', 'assets');
const scripts = (await fs.readdir(demoAssets)).filter((filename) => filename.endsWith('.js'));
const scriptContents = await Promise.all(scripts.map((filename) => fs.readFile(path.join(demoAssets, filename), 'utf8')));
if (!scriptContents.some((contents) => contents.includes('https://data.opendfieldmap.org'))) {
  throw new Error('Demo build does not reference the production data origin');
}
console.log('Verified Pages artifact: application only; map resources load from data.opendfieldmap.org.');
