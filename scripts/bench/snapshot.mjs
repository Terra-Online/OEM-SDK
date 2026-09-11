import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, symlink, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const [label, ref] = process.argv.slice(2);
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('Usage: node scripts/bench/snapshot.mjs <label> [git-ref]');
const target = path.join(root, 'artifacts/benchmarks/snapshots', label);
try { await access(target); throw new Error(`Snapshot already exists: ${target}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const git = (...args) => execFileSync('git', args, { cwd: root });
const files = (ref ? git('ls-tree', '-rz', '--name-only', ref) : git('ls-files', '-z', '--cached', '--others', '--exclude-standard'))
  .toString().split('\0').filter(file => file.startsWith('packages/') || ['scripts/build.mjs', 'tsconfig.json', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml'].includes(file)).sort();
const hash = createHash('sha256');
for (const file of files) {
  const output = path.join(target, file); await mkdir(path.dirname(output), { recursive: true });
  const bytes = ref ? git('show', `${ref}:${file}`) : await readFile(path.join(root, file));
  hash.update(file).update('\0').update(bytes);
  if (ref) await writeFile(output, bytes); else await copyFile(path.join(root, file), output);
}
await symlink(path.join(root, 'node_modules'), path.join(target, 'node_modules'));
for (const name of ['core', 'map', 'sdk', 'react']) await symlink(path.join(root, 'packages', name, 'node_modules'), path.join(target, 'packages', name, 'node_modules'));
const metadata = { label, ref: ref ? git('rev-parse', ref).toString().trim() : 'working-tree', sha256: hash.digest('hex'), files: files.length };
await writeFile(path.join(target, 'snapshot.json'), JSON.stringify(metadata, null, 2));
console.log(JSON.stringify({ ...metadata, target }));
