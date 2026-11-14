import { decodeOEMBehaviors } from './core-codec.mjs';
export { decodeOEMBehaviors, findOEMBehaviors } from './core-codec.mjs';

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
