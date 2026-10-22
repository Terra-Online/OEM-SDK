import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Export and diagnostics use the runtime codec so compact route validation
// cannot drift from the SDK. No package build or data export is required.
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../packages/core/src/behavior.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
export const { decodeOEMBehaviors, findOEMBehaviors } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

/** Copy authored tuples into the same versioned namespace as published points. */
export async function exportAtlosBehaviors({ read, versionedObject, icon, regions }) {
  const directory = 'src/data/marker/behavior/data';
  const source = await read(`${directory}/index.json`);
  decodeOEMBehaviors([], source);
  if (!Array.isArray(source.files) || new Set(source.files).size !== source.files.length)
    throw new Error('Invalid behavior sidecar file list');
  const subregions = new Set(regions.flatMap((region) => region.subregions.map((subregion) => subregion.id)));
  const files = {};
  for (const filename of source.files) {
    if (typeof filename !== 'string' || !/^[A-Za-z0-9_]+\.json$/.test(filename))
      throw new Error(`Unsafe behavior sidecar filename: ${filename}`);
    const subregionId = filename.slice(0, -5);
    if (!subregions.has(subregionId)) throw new Error(`Unknown behavior subregion: ${subregionId}`);
    const records = await read(`${directory}/${filename}`);
    decodeOEMBehaviors(records, source);
    files[subregionId] = await versionedObject('marker', `behavior/${filename}`, records);
  }
  const unlockIcon = await icon('unlock_bubble');
  if (!unlockIcon) throw new Error('Missing behavior unlock bubble icon');
  return { ...source, files, unlockIcon };
}
