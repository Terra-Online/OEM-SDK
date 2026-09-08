import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(root, 'public');
const outputRoot = path.join(root, 'artifacts', 'r2');
const localConfig = JSON.parse(await fs.readFile(path.join(root, 'config/config.r2.json'), 'utf8'))?.web?.build;
const r2 = localConfig?.r2;
if (!r2?.bucket || !r2.zoneId || !localConfig.cdn) throw new Error('Incomplete R2 deployment settings in config/config.r2.json');
const domain = new URL(localConfig.cdn).hostname;

const walk = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filename) : [filename];
  }));
  return files.flat();
};

const groupDefinitions = {
  json: { contentType: 'application/json; charset=utf-8', cacheControl: 'public, max-age=31536000, immutable' },
  webp: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' },
  woff2: { contentType: 'font/woff2', cacheControl: 'public, max-age=31536000, immutable' },
  text: { contentType: 'text/plain; charset=utf-8', cacheControl: 'public, max-age=31536000, immutable' },
  channel: { contentType: 'application/json; charset=utf-8', cacheControl: 'public, max-age=60, must-revalidate' },
};
const groups = Object.fromEntries(Object.keys(groupDefinitions).map((name) => [name, []]));
const files = (await walk(publicRoot)).sort();
let totalBytes = 0;

for (const filename of files) {
  const key = path.relative(publicRoot, filename).split(path.sep).join('/');
  const extension = path.extname(key).slice(1);
  const group = key === 'channels/stable.json' ? 'channel' : extension === 'txt' ? 'text' : extension;
  if (!(group in groups)) throw new Error(`No R2 upload policy for ${key}`);
  const stat = await fs.stat(filename);
  totalBytes += stat.size;
  groups[group].push({ key, file: path.posix.join('public', key) });
}

const channel = JSON.parse(await fs.readFile(path.join(publicRoot, 'channels/stable.json'), 'utf8'));
const manifestKey = channel.manifest?.path?.replace(/^\//, '');
if (!manifestKey) throw new Error('Stable channel does not contain a manifest path');
const manifest = JSON.parse(await fs.readFile(path.join(publicRoot, manifestKey), 'utf8'));

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });
const planGroups = [];
for (const [name, entries] of Object.entries(groups)) {
  if (!entries.length) continue;
  const filename = `${name}.json`;
  const contents = `${JSON.stringify(entries, null, 2)}\n`;
  await fs.writeFile(path.join(outputRoot, filename), contents);
  planGroups.push({
    name,
    manifest: path.posix.join('artifacts/r2', filename),
    objects: entries.length,
    sha256: createHash('sha256').update(contents).digest('hex'),
    ...groupDefinitions[name],
  });
}

const plan = {
  preparedAt: new Date().toISOString(),
  bucket: r2.bucket,
  domain,
  zoneId: r2.zoneId,
  releaseId: manifest.releaseId,
  gameVersion: manifest.gameVersion,
  objects: files.length,
  bytes: totalBytes,
  concurrency: r2.transfers ?? 96,
  groups: planGroups,
  publishOrder: [...planGroups.filter((group) => group.name !== 'channel').map((group) => group.name), 'cors', 'channel', 'domain'],
};
await fs.writeFile(path.join(outputRoot, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify(plan, null, 2));
