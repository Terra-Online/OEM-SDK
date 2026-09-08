import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const wrangler = require.resolve('wrangler');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const confirmationIndex = args.indexOf('--confirm-release');
const confirmedRelease = confirmationIndex >= 0 ? args[confirmationIndex + 1] : undefined;
const localBuildConfig = JSON.parse(await fs.readFile(path.join(root, 'config/config.r2.json'), 'utf8'))?.web?.build;
const localR2Config = localBuildConfig?.r2;
if (!localR2Config?.bucket) throw new Error('R2 bucket is missing from config/config.r2.json');

const runCommand = (command, commandArgs, capture = false, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(command, commandArgs, {
    cwd: root,
    env,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  let stdout = '';
  let stderr = '';
  if (capture) {
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
  }
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) resolve({ stdout, stderr });
    else reject(new Error(`${path.basename(command)} exited with code ${code}${stderr ? `\n${stderr}` : ''}`));
  });
});
const runWrangler = (wranglerArgs, capture = false) =>
  runCommand(process.execPath, [wrangler, ...wranglerArgs], capture);

await runWrangler(['r2', 'bucket', 'info', localR2Config.bucket], true);
await runCommand(process.execPath, [path.join(root, 'scripts/prepare-r2-upload.mjs')]);
const plan = JSON.parse(await fs.readFile(path.join(root, 'artifacts/r2/plan.json'), 'utf8'));

if (!apply) {
  console.log(`Prepared ${plan.objects} objects (${plan.bytes} bytes) for ${plan.domain}.`);
  console.log(`Publish with: pnpm deploy:data -- --confirm-release ${plan.releaseId}`);
  process.exit(0);
}
if (confirmedRelease !== plan.releaseId) {
  throw new Error(`Refusing to publish: pass --confirm-release ${plan.releaseId}`);
}

let endpoint;
try { endpoint = new URL(localR2Config.endpoint); } catch { throw new Error('Invalid R2 S3 endpoint in config/config.r2.json'); }
if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.r2.cloudflarestorage.com') ||
  localR2Config.bucket !== plan.bucket ||
  !localR2Config?.accessKeyId || !localR2Config?.accessKeySecret) {
  throw new Error('R2 S3 credentials are missing or do not match the prepared bucket in config/config.r2.json');
}
const remoteName = 'oempubsdk';
const remoteRoot = `${remoteName}:${plan.bucket}`;
const rcloneEnv = {
  ...process.env,
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_TYPE`]: 's3',
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_PROVIDER`]: 'Cloudflare',
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_ACCESS_KEY_ID`]: localR2Config.accessKeyId,
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_SECRET_ACCESS_KEY`]: localR2Config.accessKeySecret,
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_ENDPOINT`]: localR2Config.endpoint,
  [`RCLONE_CONFIG_${remoteName.toUpperCase()}_REGION`]: localR2Config.region || 'auto',
};
const runRclone = (rcloneArgs, capture = false) => runCommand('rclone', rcloneArgs, capture, rcloneEnv);
const commonRcloneArgs = [
  '--s3-no-check-bucket',
  '--transfers', String(plan.concurrency), '--checkers', '32', '--fast-list',
  '--stats', '10s', '--stats-one-line',
];
await runRclone([
  'copy', 'public', remoteRoot,
  '--exclude', 'channels/stable.json',
  '--header-upload', 'Cache-Control: public, max-age=31536000, immutable',
  ...commonRcloneArgs,
]);

await runWrangler(['r2', 'bucket', 'cors', 'set', plan.bucket, '--file', localR2Config.corsFile, '--force']);
await runRclone([
  'copyto', 'public/channels/stable.json', `${remoteRoot}/channels/stable.json`,
  '--s3-no-check-bucket',
  '--header-upload', 'Cache-Control: public, max-age=60, must-revalidate',
]);

const domains = await runWrangler(['r2', 'bucket', 'domain', 'list', plan.bucket], true);
if (!domains.stdout.includes(`domain:            ${plan.domain}`)) {
  await runWrangler([
    'r2', 'bucket', 'domain', 'add', plan.bucket,
    '--domain', plan.domain,
    '--zone-id', plan.zoneId,
    '--min-tls', localR2Config.minimumTlsVersion ?? '1.2',
    '--force',
  ]);
}

const localChannel = JSON.parse(await fs.readFile(path.join(root, 'public/channels/stable.json'), 'utf8'));
const remoteChannel = await runRclone(['cat', `${remoteRoot}/channels/stable.json`, '--s3-no-check-bucket'], true);
const published = JSON.parse(remoteChannel.stdout);
if (published.manifest?.path !== localChannel.manifest?.path) throw new Error('Published stable channel verification failed');
console.log(`Published ${plan.releaseId} to https://${plan.domain}/channels/stable.json`);
