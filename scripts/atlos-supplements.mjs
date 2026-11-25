/** Validate compact wall geometry grouped by the owning region's subregions. */
export function validateAtlosWalls(value, region) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Invalid wall sidecar for ${region.id}`);
  const subregions = new Set(region.subregions.map(({ id }) => id));
  const ids = new Set();
  for (const [subregion, rows] of Object.entries(value)) {
    if (!subregions.has(subregion) || !Array.isArray(rows))
      throw new Error(`Invalid wall sidecar subregion: ${subregion}`);
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 3) throw new Error(`Invalid wall row in ${subregion}`);
      const [id, tier, segment] = row;
      if (
        typeof id !== 'string' ||
        !/^\d+$/.test(id) ||
        ids.has(id) ||
        !Number.isInteger(tier) ||
        !Array.isArray(segment) ||
        segment.length !== 2 ||
        !segment.every(
          (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
        ) ||
        (segment[0][0] === segment[1][0] && segment[0][1] === segment[1][1])
      ) {
        throw new Error(`Invalid wall ${id} in ${subregion}`);
      }
      ids.add(id);
    }
  }
}
