import { describe, expect, it } from 'vitest';
import { historyEntry, latestReleaseHistory } from '../scripts/release-history.mjs';

const entry = (releaseId, gameVersion, gameBuild, generatedAt) =>
  historyEntry({ releaseId, gameVersion, gameBuild, generatedAt }, releaseId);

describe('release history', () => {
  it('selects the latest data release for each hotfix in version order', () => {
    const prior = entry('atlos-1111111', '1_6_4', '10781849-3', '2026-11-13T12:00:00Z');
    const latest = entry('atlos-2222222', '1_6_4', '10781849-3', '2026-11-14T12:00:00Z');
    const otherHotfix = entry('atlos-3333333', '1_6_4', '10781849-2', '2026-11-15T12:00:00Z');
    const olderVersion = entry('atlos-4444444', '1_6_3', '11010254-4', '2026-10-16T12:00:00Z');
    expect(latestReleaseHistory([latest, olderVersion, otherHotfix, prior]).versions).toEqual([
      latest,
      otherHotfix,
      olderVersion,
    ]);
  });

  it('retains a known legacy hotfix and omits releases with no identified build', () => {
    expect(entry('atlos-43b8a25', '1_5_3', undefined, '2026-09-10T14:29:20Z').gameBuild).toBe('9885010-4');
    expect(entry('atlos-ac34c77', '1_5_3', undefined, '2026-09-10T01:01:09Z')).toBeUndefined();
  });
});
