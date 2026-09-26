import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await fs.readFile(path.join(root, 'config/config.r2.json'), 'utf8'))?.web?.build;
const r2 = config?.r2;
if (!r2?.bucket || !r2.endpoint || !r2.accessKeyId || !r2.accessKeySecret) {
  throw new Error('Incomplete R2 deployment settings in config/config.r2.json');
}

const gameVersion = process.env.OEM_TILE_MIGRATION_GAME_VERSION ?? '1_5_3';
const sourceBuild = process.env.OEM_TILE_MIGRATION_SOURCE_BUILD ?? 'legacy';
const targetBuild = process.env.OEM_TILE_MIGRATION_TARGET_BUILD ?? '9885010-4';
const apply = process.argv.includes('--apply');
const sourceRoot = `tiles/${gameVersion}`;
const targetRoot = `tiles/${gameVersion}/${targetBuild}`;
const remoteName = 'oemtilemigration';
const remoteRoot = `${remoteName}:${r2.bucket}`;
const env = {
  ...process.env,
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_TYPE`]: 's3',
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_PROVIDER`]: 'Cloudflare',
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_ACCESS_KEY_ID`]: r2.accessKeyId,
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_SECRET_ACCESS_KEY`]: r2.accessKeySecret,
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_ENDPOINT`]: r2.endpoint,
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_REGION`]: r2.region ?? 'auto',
};

const run = (args, capture = false) =>
  new Promise((resolve, reject) => {
    const child = spawn('rclone', args, {
      cwd: root,
      env,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
    }
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`rclone failed (${code})${stderr ? `\n${stderr}` : ''}`)),
    );
  });

const listing = await run(
  [
    'lsf',
    `${remoteRoot}/${sourceRoot}`,
    '--recursive',
    '--files-only',
    '--format',
    'ps',
    '--separator',
    ';',
    '--fast-list',
    '--exclude',
    `${targetBuild}/**`,
    '--s3-no-check-bucket',
  ],
  true,
);
const entries = listing
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const separator = line.lastIndexOf(';');
    if (separator < 1) throw new Error(`Unexpected R2 listing entry: ${line}`);
    return { Path: line.slice(0, separator), Size: Number(line.slice(separator + 1)) };
  });
if (!entries.length) throw new Error(`No remote tiles found under ${sourceRoot}`);

const files = entries
  .map((entry) => {
    const relative = entry.Path.replaceAll('\\', '/');
    if (!/^\w+\/\d+\/-?\d+\/-?\d+(?:_[a-z]\d+)?\.webp$/.test(relative)) {
      throw new Error(`Unexpected legacy tile path: ${relative}`);
    }
    return {
      source: `${sourceRoot}/${relative}`,
      target: `${targetRoot}/${relative}`,
      bytes: entry.Size,
    };
  })
  .sort((left, right) => left.source.localeCompare(right.source));
const mappingBytes = Buffer.from(JSON.stringify(files));
const plan = {
  preparedAt: new Date().toISOString(),
  bucket: r2.bucket,
  gameVersion,
  sourceBuild,
  targetBuild,
  sourceRoot,
  targetRoot,
  objects: files.length,
  bytes: files.reduce((total, file) => total + file.bytes, 0),
  mappingSha256: createHash('sha256').update(mappingBytes).digest('hex'),
  files,
  applyCommand: `node scripts/prepare-tile-migration.mjs --apply`,
};
const output = path.join(root, 'artifacts', 'tile-migration.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(plan, null, 2)}\n`);

if (apply) {
  await run([
    'copy',
    `${remoteRoot}/${sourceRoot}`,
    `${remoteRoot}/${targetRoot}`,
    '--s3-no-check-bucket',
    '--ignore-times',
    '--exclude',
    `${targetBuild}/**`,
    '--header-upload',
    'Cache-Control: public, max-age=31536000, immutable',
  ]);
  const targetListing = await run(
    [
      'lsf',
      `${remoteRoot}/${targetRoot}`,
      '--recursive',
      '--files-only',
      '--format',
      'ps',
      '--separator',
      ';',
      '--fast-list',
      '--s3-no-check-bucket',
    ],
    true,
  );
  const remoteTarget = targetListing.trim().split('\n').filter(Boolean);
  const targetBytes = remoteTarget.reduce(
    (total, line) => Number(line.slice(line.lastIndexOf(';') + 1)) + total,
    0,
  );
  if (remoteTarget.length !== plan.objects || targetBytes !== plan.bytes) {
    throw new Error(
      `Migration verification failed: ${remoteTarget.length} objects/${targetBytes} bytes; expected ${plan.objects}/${plan.bytes}`,
    );
  }
  console.log(`Migrated ${plan.objects} tiles (${plan.bytes} bytes) to ${targetRoot}.`);
} else {
  console.log(`Prepared migration for ${plan.objects} tiles (${plan.bytes} bytes).`);
  console.log(`Dry run only. Apply with: ${plan.applyCommand}`);
}
