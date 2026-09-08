import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'artifacts/npm');
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

for (const name of ['core', 'map', 'sdk', 'react']) {
  execFileSync('pnpm', ['pack', '--pack-destination', output], {
    cwd: path.join(root, 'packages', name),
    stdio: 'inherit',
  });
}

console.log(`Packed npm release candidates in ${output}`);
