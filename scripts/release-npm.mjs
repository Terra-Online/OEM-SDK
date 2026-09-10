import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageNames = ['core', 'map', 'sdk', 'react'];
const args = process.argv.slice(2);
const targetVersion = args.find((arg) => arg.startsWith('--version='))?.slice('--version='.length)
  ?? args.find((arg) => !arg.startsWith('--'));
const publish = args.includes('--publish');
const dryRun = args.includes('--dry-run');
const tagArgument = args.find((arg) => arg.startsWith('--tag='))?.slice('--tag='.length);

if (!targetVersion || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(targetVersion)) {
  throw new Error('Usage: pnpm release:npm --version=<semver> [--publish] [--dry-run] [--tag=<tag>]');
}

const inferredTag = targetVersion.includes('-') ? targetVersion.split('-')[1].split('.')[0] : 'latest';
const tag = tagArgument ?? inferredTag;
if (!/^[a-z0-9][a-z0-9._-]*$/.test(tag)) throw new Error(`Invalid npm dist-tag: ${tag}`);

const packageFiles = packageNames.map((name) => path.join(root, 'packages', name, 'package.json'));
const packageData = await Promise.all(packageFiles.map(async (filename) => ({
  filename,
  text: await fs.readFile(filename, 'utf8'),
  json: JSON.parse(await fs.readFile(filename, 'utf8')),
})));
const names = packageData.map(({ json }) => json.name);
if (new Set(names).size !== names.length) throw new Error('Workspace package names must be unique');

// Publishing is intentionally gated before changing manifests, so a missing
// npm login never leaves the workspace in a half-bumped state.
if (publish && !dryRun) {
  try {
    execFileSync('npm', ['whoami', '--registry=https://registry.npmjs.org/'], { cwd: root, stdio: 'ignore' });
  } catch {
    throw new Error('npm is not authenticated. Run `npm login` (or configure an npm token), then retry.');
  }
}

for (const { filename, text, json } of packageData) {
  if (json.private) throw new Error(`Refusing to version private package ${json.name}`);
  if (json.version === targetVersion) continue;
  const updated = text.replace(/(\"version\"\s*:\s*)\"[^\"]+\"/, `$1\"${targetVersion}\"`);
  if (updated === text) throw new Error(`Could not update version in ${filename}`);
  await fs.writeFile(filename, updated);
}

const run = (command, commandArgs) => execFileSync(command, commandArgs, { cwd: root, stdio: 'inherit' });
run('pnpm', ['check']);
run('pnpm', ['pack:release']);

if (publish) {
  const publishArgs = ['-r', 'publish', '--tag', tag, '--access', 'public', '--no-git-checks', '--report-summary'];
  if (dryRun) publishArgs.push('--dry-run');
  run('pnpm', publishArgs);
  console.log(`${dryRun ? 'Validated' : 'Published'} ${names.join(', ')} at ${targetVersion} with dist-tag ${tag}.`);
} else {
  console.log(`Prepared ${names.join(', ')} at ${targetVersion}; tarballs are in artifacts/npm.`);
  console.log(`Publish with: pnpm release:npm --version=${targetVersion} --publish --tag=${tag}`);
}
