import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const demoOnly = process.argv.includes('--demo-only');
const publish = process.argv.includes('--publish');
if (demoOnly && publish) throw new Error('--demo-only cannot be combined with --publish');

const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: process.env });
  child.once('error', reject);
  child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`)));
});

// The demo is intentionally a separate, safe fast path. Data exports always
// produce and validate the channel and manifest as one immutable batch.
if (demoOnly) {
  await run('pnpm', ['build:demo']);
  console.log('Updated demo locally; manifest and channel were not changed.');
} else {
  await run('pnpm', ['export:atlos']);
  await run('pnpm', ['validate:export']);
  await run('pnpm', ['build:demo']);
  await run(process.execPath, [path.join(root, 'scripts/prepare-r2-upload.mjs')]);
  console.log('Updated local data, demo, and deterministic R2 plan. No publish or deploy was performed.');
}

if (publish) {
  const plan = JSON.parse(await fs.readFile(path.join(root, 'artifacts/r2/plan.json'), 'utf8'));
  await run(process.execPath, [path.join(root, 'scripts/publish-r2.mjs'), '--apply', '--confirm-release', plan.releaseId]);
  await run('pnpm', ['exec', 'wrangler', 'pages', 'deploy', 'dist', '--project-name', 'oem-sdk', '--branch', 'main', '--commit-dirty=true']);
  console.log(`Published data and deployed the matching Pages artifact for ${plan.releaseId}.`);
}

// Keep the promise of a local-only command explicit for scripts and CI logs.
await fs.access(path.join(root, demoOnly ? 'dist' : 'artifacts/r2/plan.json'));
