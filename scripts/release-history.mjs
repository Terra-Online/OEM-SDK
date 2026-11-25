const releaseIdPattern = /^atlos-[a-f0-9]{7}$/;
const versionPattern = /^\d+_\d+_\d+$/;
const buildPattern = /^\d+-\d+$/;

// This build was already exposed by the Demo before manifests carried gameBuild.
const legacyBuilds = { 'atlos-43b8a25': '9885010-4' };

export function historyEntry(manifest, releaseId) {
  if (manifest.releaseId !== releaseId || !releaseIdPattern.test(releaseId)) {
    throw new Error(`Unexpected release ID in ${releaseId}/manifest.json`);
  }
  const gameBuild = manifest.gameBuild ?? legacyBuilds[releaseId];
  if (!gameBuild) return undefined;
  const entry = {
    id: releaseId,
    gameVersion: manifest.gameVersion,
    gameBuild,
    generatedAt: manifest.generatedAt,
    manifestPath: `/releases/${releaseId}/manifest.json`,
  };
  validateHistoryEntry(entry);
  return entry;
}

export function latestReleaseHistory(entries) {
  const latest = new Map();
  for (const entry of entries) {
    validateHistoryEntry(entry);
    const key = `${entry.gameVersion}/${entry.gameBuild}`;
    const previous = latest.get(key);
    if (!previous || compareReleaseTime(entry, previous) > 0) latest.set(key, entry);
  }
  return {
    schemaVersion: 1,
    versions: [...latest.values()].sort(
      (left, right) =>
        right.gameVersion.localeCompare(left.gameVersion, 'en', { numeric: true }) ||
        right.gameBuild.localeCompare(left.gameBuild, 'en', { numeric: true }),
    ),
  };
}

function validateHistoryEntry(entry) {
  if (
    !entry ||
    !releaseIdPattern.test(entry.id) ||
    !versionPattern.test(entry.gameVersion) ||
    !buildPattern.test(entry.gameBuild) ||
    !Number.isFinite(Date.parse(entry.generatedAt)) ||
    entry.manifestPath !== `/releases/${entry.id}/manifest.json`
  ) {
    throw new Error(`Invalid release history entry: ${entry?.id ?? '<missing>'}`);
  }
}

function compareReleaseTime(left, right) {
  return Date.parse(left.generatedAt) - Date.parse(right.generatedAt) || left.id.localeCompare(right.id);
}
