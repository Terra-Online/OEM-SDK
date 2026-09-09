import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const rclone = 'rclone';
const publicRoot = path.join(root, 'public');
const args = process.argv.slice(2);
const planArgument = args.find((entry) => entry.startsWith('--plan='))?.slice('--plan='.length);
const preflight = args.includes('--preflight');
const planPath = path.resolve(root, planArgument ?? 'artifacts/r2/plan.json');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = async (filename) => JSON.parse(await fs.readFile(filename, 'utf8'));
const fail = (message) => { throw new Error(message); };

const config = await readJson(path.join(root, 'config/config.r2.json'));
const buildConfig = config?.web?.build;
const r2Config = buildConfig?.r2;
const plan = await readJson(planPath);
const bucket = process.env.OEM_R2_BUCKET ?? r2Config?.bucket ?? plan.bucket;
const endpointValue = process.env.OEM_R2_ENDPOINT ?? r2Config?.endpoint;
const accessKeyId = process.env.OEM_R2_ACCESS_KEY_ID ?? r2Config?.accessKeyId;
const accessKeySecret = process.env.OEM_R2_ACCESS_KEY_SECRET ?? r2Config?.accessKeySecret;
if (!bucket || !endpointValue || !accessKeyId || !accessKeySecret) fail('R2 validation credentials are incomplete');
let endpoint;
try { endpoint = new URL(endpointValue); } catch { fail('Invalid R2 S3 endpoint'); }
if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.r2.cloudflarestorage.com')) {
  fail('R2 S3 endpoint must be an HTTPS Cloudflare R2 endpoint');
}
if (bucket !== plan.bucket) fail('R2 bucket does not match the prepared release plan');
if (!plan.domain || !plan.releaseId || !plan.gameVersion) fail('R2 release plan is incomplete');

const runCommand = (command, commandArgs, env) => new Promise((resolve, reject) => {
  const child = spawn(command, commandArgs, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0
    ? resolve({ stdout, stderr })
    : reject(new Error(`rclone check failed with code ${code}`)));
});

const remoteName = 'oemvalidate';
const remoteRoot = `${remoteName}:${bucket}`;
const rcloneEnv = {
  ...process.env,
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_TYPE`]: 's3',
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_PROVIDER`]: 'Cloudflare',
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_ACCESS_KEY_ID`]: accessKeyId,
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_SECRET_ACCESS_KEY`]: accessKeySecret,
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_ENDPOINT`]: endpointValue,
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_REGION`]: r2Config?.region ?? 'auto',
};
const checkArguments = [
  'check', 'public', remoteRoot, '--one-way', '--size-only', '--fast-list', '--s3-no-check-bucket',
];
if (preflight) checkArguments.push('--exclude', 'channels/stable.json');
await runCommand(rclone, checkArguments, rcloneEnv);

const channelPath = path.join(publicRoot, 'channels/stable.json');
const localChannelBytes = await fs.readFile(channelPath);
const localChannel = JSON.parse(localChannelBytes.toString());
const manifestReference = localChannel.manifest;
if (!manifestReference?.path || !manifestReference?.sha256 || !Number.isInteger(manifestReference.bytes)) {
  fail('Stable channel manifest reference is incomplete');
}
const validateResourcePath = (resourcePath) => {
  if (typeof resourcePath !== 'string' || !resourcePath.startsWith('/') || resourcePath.split('/').includes('..') ||
    /^[a-z][a-z\d+.-]*:/i.test(resourcePath) || resourcePath.startsWith('//')) {
    fail(`Unsafe published resource path: ${resourcePath}`);
  }
};
validateResourcePath(manifestReference.path);
const manifestPath = path.join(publicRoot, manifestReference.path.replace(/^\//, ''));
const localManifestBytes = await fs.readFile(manifestPath);
const localManifest = JSON.parse(localManifestBytes.toString());
if (localManifest.releaseId !== plan.releaseId || localManifest.gameVersion !== plan.gameVersion) {
  fail('Local manifest does not match the prepared release plan');
}

const origin = `https://${plan.domain}`;
const urlFor = (resourcePath) => {
  validateResourcePath(resourcePath);
  return new URL(resourcePath.replace(/^\//, ''), `${origin}/`).toString();
};
const expectedContentType = (resourcePath) => {
  if (resourcePath.endsWith('.json')) return 'application/json';
  if (resourcePath.endsWith('.webp')) return 'image/webp';
  if (resourcePath.endsWith('.woff2')) return 'font/woff2';
  if (resourcePath.endsWith('.txt')) return 'text/plain';
  fail(`Unknown published resource type: ${resourcePath}`);
};
const expectedCacheControl = (resourcePath) => resourcePath === '/channels/stable.json'
  ? ['max-age=60', 'must-revalidate']
  : ['max-age=31536000', 'immutable'];
const checkHeaders = (resourcePath, response) => {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith(expectedContentType(resourcePath))) {
    fail(`Unexpected Content-Type for ${resourcePath}: ${contentType || '<missing>'}`);
  }
  const cacheControl = response.headers.get('cache-control')?.toLowerCase() ?? '';
  for (const directive of expectedCacheControl(resourcePath)) {
    if (!cacheControl.includes(directive)) fail(`Unexpected Cache-Control for ${resourcePath}: ${cacheControl || '<missing>'}`);
  }
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && !/^\d+$/.test(contentLength)) fail(`Invalid Content-Length for ${resourcePath}`);
};

const headObject = async (resourcePath, query = '') => {
  const response = await fetch(`${urlFor(resourcePath)}${query}`, { method: 'HEAD', redirect: 'error' });
  if (!response.ok) fail(`Remote HEAD failed (${response.status}): ${resourcePath}`);
  checkHeaders(resourcePath, response);
};

const getObject = async (resourcePath, expectedBytes, expectedHash) => {
  const response = await fetch(urlFor(resourcePath), { redirect: 'error' });
  if (!response.ok) fail(`Remote GET failed (${response.status}): ${resourcePath}`);
  checkHeaders(resourcePath, response);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength !== expectedBytes) fail(`Remote size mismatch: ${resourcePath}`);
  if (hash(bytes) !== expectedHash) fail(`Remote hash mismatch: ${resourcePath}`);
  return bytes;
};

const references = new Map();
const addReference = (reference) => {
  if (!reference) return;
  if (!reference?.path || !Number.isInteger(reference.bytes) || typeof reference.sha256 !== 'string') {
    fail('Manifest contains an incomplete asset reference');
  }
  validateResourcePath(reference.path);
  if (references.has(reference.path) && references.get(reference.path).sha256 !== reference.sha256) {
    fail(`Conflicting asset references: ${reference.path}`);
  }
  references.set(reference.path, reference);
};
addReference(manifestReference);
addReference(localManifest.types);
addReference(localManifest.pointIndex);
for (const font of localManifest.fonts ?? []) addReference(font);
if (localManifest.fontLicense) addReference(localManifest.fontLicense);
for (const license of localManifest.fontLicenses ?? []) addReference(license);
for (const reference of Object.values(localManifest.locales ?? {})) addReference(reference);
for (const region of localManifest.regions ?? []) {
  for (const reference of region.points ?? []) addReference(reference);
  addReference(region.labels);
  addReference(region.boundaries);
}

if (!preflight) await getObject('/channels/stable.json', localChannelBytes.byteLength, hash(localChannelBytes));
for (const reference of references.values()) {
  const localPath = path.join(publicRoot, reference.path.replace(/^\//, ''));
  const localBytes = await fs.readFile(localPath);
  if (localBytes.byteLength !== reference.bytes || hash(localBytes) !== reference.sha256) {
    fail(`Local asset no longer matches its manifest reference: ${reference.path}`);
  }
  await getObject(reference.path, reference.bytes, reference.sha256);
}

const typeData = JSON.parse((await fs.readFile(path.join(publicRoot, localManifest.types.path.replace(/^\//, '')))).toString());
const iconPaths = new Set();
for (const type of Object.values(typeData)) {
  if (type?.icon) iconPaths.add(type.icon);
  if (type?.subIcon) iconPaths.add(type.subIcon);
}
for (const iconPath of iconPaths) await headObject(iconPath);

const tileChecks = new Map();
for (const region of localManifest.regions ?? []) {
  for (const floor of region.floors ?? []) {
    const coverage = localManifest.regions.find((entry) => entry.id === region.id)?.coverage ?? {};
    let candidate;
    for (const [zoom, floors] of Object.entries(coverage)) {
      const rows = floors?.[floor.id];
      const row = rows && Object.entries(rows)[0];
      const range = row?.[1];
      if (!range?.length) continue;
      const tileX = range[0];
      const tileY = row[0];
      const tilePath = floor.tileTemplate.replace('{z}', zoom).replace('{x}', String(tileX)).replace('{y}', tileY);
      const version = floor.tileVersions?.[zoom]?.[tileY]?.[0];
      candidate = { path: tilePath, query: version ? `?v=${version}` : '' };
      break;
    }
    if (candidate) tileChecks.set(candidate.path, candidate.query);
  }
}
for (const [tilePath, query] of tileChecks) await headObject(tilePath, query);

console.log(JSON.stringify({
  releaseId: localManifest.releaseId,
  gameVersion: localManifest.gameVersion,
  remoteObjectsChecked: plan.objects,
  hashedAssetsChecked: references.size + 1,
  iconHeadersChecked: iconPaths.size,
  tileHeadersChecked: tileChecks.size,
  channelChecked: !preflight,
  browserSmokeTest: false,
}, null, 2));
