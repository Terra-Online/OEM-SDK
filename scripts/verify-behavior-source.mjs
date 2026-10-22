import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { decodeOEMBehaviors, findOEMBehaviors, exportAtlosBehaviors } from './atlos-behaviors.mjs';

// Compare actual source outputs without regenerating the SDK's data snapshot.
const root = path.resolve(import.meta.dirname, '..');
const source = path.resolve(process.argv[2] ?? path.join(root, '../Atlos/talos'));
const behaviorRoot = path.join(source, 'src/data/marker/behavior');
const read = async (relative) => JSON.parse(await readFile(path.join(source, relative), 'utf8'));
const index = await read('src/data/marker/behavior/data/index.json');
const moduleMap = `{${index.files.map((file) => `${JSON.stringify(`./data/${file}`)}:()=>import(${JSON.stringify(`./data/${file}`)})`).join(',')}}`;
const bundle = await build({
  stdin: {
    resolveDir: root,
    contents: `export * from ${JSON.stringify(path.join(behaviorRoot, 'index.ts'))};`,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [
    {
      name: 'source-json-loaders',
      setup(builder) {
        builder.onLoad({ filter: /marker\/behavior\/index\.ts$/ }, async ({ path: filename }) => ({
          contents: (await readFile(filename, 'utf8')).replace(
            "import.meta.glob('./data/*.json')",
            moduleMap,
          ),
          loader: 'ts',
          resolveDir: behaviorRoot,
        }));
      },
    },
  ],
});
const upstream = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const counts = {};
let selections = 0;
for (const file of index.files) {
  const id = file.slice(0, -5);
  const rows = await read(`src/data/marker/behavior/data/${file}`);
  const records = decodeOEMBehaviors(rows, index);
  assert.deepEqual(records, await upstream.loadBehaviorForSubregion(id), `Decoded route mismatch: ${id}`);
  const ids = new Set();
  for (const record of records) {
    counts[record.kind] = (counts[record.kind] ?? 0) + 1;
    ids.add(record.anchorId);
    if (record.kind === 'relation') ids.add(record.targetId);
  }
  for (const pointId of ids) {
    assert.deepEqual(
      findOEMBehaviors(records, pointId),
      await upstream.findBehaviorForMarker(id, pointId),
      `Selection mismatch: ${id}/${pointId}`,
    );
    selections++;
  }
}
let exported = 0;
const regions = Object.values(await read('src/data/map/region.json')).map((region) => ({
  subregions: region.subregions.map((id) => ({ id })),
}));
const catalog = await exportAtlosBehaviors({
  read,
  regions,
  versionedObject: async (namespace, name, rows) => {
    exported++;
    return {
      path: `/${namespace}/probe/__release__/${name}`,
      sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
      bytes: Buffer.byteLength(JSON.stringify(rows)),
    };
  },
  icon: async () => {
    await readFile(path.join(source, 'src/assets/images/item/unlock_bubble.webp'));
    return '/probe/unlock.webp';
  },
});
assert.equal(exported, index.files.length);
assert.equal(Object.keys(catalog.files).length, index.files.length);
const report = {
  sourceCommit: execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  files: exported,
  counts,
  selections,
  publicDataWritten: false,
};
const output = path.join(root, 'artifacts/behavior-integration');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'source-parity.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
