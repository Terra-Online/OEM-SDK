import { lstat, mkdir, readdir, symlink, unlink } from 'node:fs/promises';
import path from 'node:path';

/** Share installed third-party dependencies, but resolve workspace packages inside each snapshot. */
export async function linkSnapshotDependencies(root, snapshot) {
  const packages = ['core', 'map', 'sdk', 'react'];
  for (const relative of ['', ...packages.map(name => `packages/${name}`)]) {
    const source = path.join(root, relative, 'node_modules');
    const target = path.join(snapshot, relative, 'node_modules');
    try { if ((await lstat(target)).isSymbolicLink()) await unlink(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await mkdir(target, { recursive: true });
    let entries = [];
    try { entries = await readdir(source); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const entry of entries.filter(entry => entry !== '@opendfieldmap')) {
      try { await symlink(path.join(source, entry), path.join(target, entry)); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    await mkdir(path.join(target, '@opendfieldmap'), { recursive: true });
    for (const name of packages) {
      const link = path.join(target, '@opendfieldmap', name);
      try { await symlink(path.join(snapshot, 'packages', name), link); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
  }
}
