import { invalid } from './errors';
import type { OEMAsset } from './types';

/** Normalized map coordinates in authored [z, x] order, without native-zoom scaling. */
type MapPoint = [z: number, x: number];
export type { MapPoint as OEMBehaviorPoint };
type StageMode = 'collinear' | 'branch' | 'multiline';
type SegmentPhase = 'group-entry' | 'group-members' | 'chest-entry';
type SegmentKind = 'solid' | 'dash';

export type OEMBehavior =
  | {
      kind: 'butterfly-path';
      anchorId: string;
      stages: Array<{
        center?: MapPoint;
        mode: StageMode;
        orderedPoints: Array<MapPoint>;
        lineGroups?: Array<Array<MapPoint>>;
      }>;
      targetPos?: MapPoint;
      segments: Array<{
        order: number;
        stageIndex: number;
        phase: SegmentPhase;
        kind: SegmentKind;
        points: Array<MapPoint>;
      }>;
    }
  | {
      kind: 'relation';
      anchorId: string;
      targetId: string;
      anchorPos: MapPoint;
      targetPos: MapPoint;
    }
  | {
      kind: 'unlock-group';
      anchorId: string;
      anchorPos: MapPoint;
      helpers: Array<{ pos: MapPoint }>;
    }
  | {
      kind: 'trajectory';
      anchorId: string;
      points: Array<MapPoint>;
      closed: boolean;
    };

export type OEMBehaviorLayout = {
  records: {
    relation: string;
    butterflyPath: string;
    unlockGroup: string;
    trajectory: string;
  };
  stageModes: Record<StageMode, number>;
};

/** Optional behavior sidecars belonging to this exact immutable release. */
export interface OEMBehaviorCatalog {
  schemaVersion: 6;
  encoding: 'tuple-v1';
  layout: OEMBehaviorLayout;
  files: Record<string, OEMAsset>;
  unlockIcon?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Decode tuple-v1 sidecars without changing authored map coordinates or route order. */
export function decodeOEMBehaviors(value: unknown, format: unknown): OEMBehavior[] {
  if (!isObject(format) || format.schemaVersion !== 6 || format.encoding !== 'tuple-v1')
    invalid('behaviors.encoding', 'Unsupported behavior sidecar format');
  const layout = format.layout;
  if (!isObject(layout) || !isObject(layout.records) || !isObject(layout.stageModes))
    invalid('behaviors.layout', 'Missing behavior record layout');
  const { records, stageModes } = layout;
  const codes = ['relation', 'butterflyPath', 'unlockGroup', 'trajectory'].map((key) => records[key]);
  const modes = ['collinear', 'branch', 'multiline'].map((key) => stageModes[key]);
  if (
    codes.some((code) => typeof code !== 'string' || !code) ||
    new Set(codes).size !== 4 ||
    modes.some((code) => !Number.isSafeInteger(code)) ||
    new Set(modes).size !== 3
  )
    invalid('behaviors.layout', 'Invalid or duplicate behavior codes');
  if (!Array.isArray(value)) invalid('behaviors', 'Expected a behavior record array');
  return value.map((row, index) => {
    // The layout has been checked above; decoding rejects malformed geometry
    // instead of quietly publishing or displaying a partial route.
    const record = decodeBehaviorRecord(row, layout as OEMBehaviorLayout);
    return record ?? invalid(`behaviors[${index}]`, 'Invalid behavior record');
  });
}

/** Include the complete butterfly route when its related chest is selected. */
export function findOEMBehaviors(records: readonly OEMBehavior[], pointId: string): OEMBehavior[] {
  const direct = records.filter(
    (record) => record.anchorId === pointId || (record.kind === 'relation' && record.targetId === pointId),
  );
  const butterflyIds = new Set(
    direct.filter((record) => record.kind === 'relation').map((record) => record.anchorId),
  );
  if (!butterflyIds.size) return direct;
  const selected = new Set(direct);
  return [
    ...direct,
    ...records.filter(
      (record) =>
        record.kind === 'butterfly-path' && butterflyIds.has(record.anchorId) && !selected.has(record),
    ),
  ];
}

const codeFor = (table: Record<StageMode, number>, value: unknown): StageMode | null =>
  (['collinear', 'branch', 'multiline'] as const).find((mode) => table[mode] === value) ?? null;

const decodeId = (value: unknown): string | null => {
  if (typeof value === 'string') return value && value.trim() === value ? value : null;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
};

const decodePoint = (value: unknown): MapPoint | null => {
  if (!Array.isArray(value) || value.length !== 2) return null;
  if (typeof value[0] !== 'number' || typeof value[1] !== 'number') return null;
  if (!Number.isFinite(value[0]) || !Number.isFinite(value[1])) return null;
  return [value[0], value[1]];
};

const decodePoints = (value: unknown): MapPoint[] | null => {
  if (!Array.isArray(value)) return null;
  const points: MapPoint[] = [];
  for (const item of value) {
    const point = decodePoint(item);
    if (!point) return null;
    points.push(point);
  }
  return points;
};

const decodeBehaviorRecord = (value: unknown, layout: OEMBehaviorLayout): OEMBehavior | null => {
  if (!Array.isArray(value) || typeof value[0] !== 'string') return null;
  const recordCode = value[0];

  if (recordCode === layout.records.relation) {
    const anchorId = decodeId(value[1]);
    const targetId = decodeId(value[2]);
    const anchorPos = decodePoint(value[3]);
    const targetPos = decodePoint(value[4]);
    if (!anchorId || !targetId || !anchorPos || !targetPos) return null;
    return { kind: 'relation', anchorId, targetId, anchorPos, targetPos };
  }

  if (recordCode === layout.records.butterflyPath) {
    const anchorId = decodeId(value[1]);
    const leaderPos = decodePoint(value[2]);
    const targetPos = value[3] == null ? undefined : decodePoint(value[3]);
    if (!anchorId || !leaderPos || (value[3] != null && !targetPos) || !Array.isArray(value[4])) {
      return null;
    }

    const stages: Array<{
      center?: MapPoint;
      mode: StageMode;
      orderedPoints: Array<MapPoint>;
      lineGroups?: Array<Array<MapPoint>>;
    }> = [];
    for (const row of value[4]) {
      if (!Array.isArray(row) || row.length < 2) return null;
      const mode = codeFor(layout.stageModes, row[0]);
      if (!mode) return null;
      if (mode === 'multiline') {
        if (!Array.isArray(row[1]) || row[1].length < 2) return null;
        const lineGroups: Array<MapPoint[]> = [];
        for (const line of row[1]) {
          const points = decodePoints(line);
          if (!points || points.length < 2) return null;
          lineGroups.push(points);
        }
        const orderedPoints = lineGroups.flat();
        stages.push({ orderedPoints, mode, lineGroups });
        continue;
      }
      const orderedPoints = decodePoints(row[1]);
      if (!orderedPoints || orderedPoints.length === 0) return null;
      const center = row.length > 2 ? decodePoint(row[2]) : undefined;
      if (row.length > 2 && !center) return null;
      if (mode === 'branch' && !center) return null;
      stages.push({
        orderedPoints,
        mode,
        ...(center ? { center } : {}),
      });
    }

    // Segment geometry is deterministic from the baked stage mode/order.
    // Rebuild it in memory instead of repeating every line wrapper in the
    // sidecar file.
    const segments: Array<{
      order: number;
      stageIndex: number;
      phase: SegmentPhase;
      kind: SegmentKind;
      points: Array<MapPoint>;
    }> = [];
    let current = leaderPos;
    let order = 0;
    const appendSegment = (
      stageIndex: number,
      phase: SegmentPhase,
      kind: SegmentKind,
      points: MapPoint[],
    ) => {
      if (points.length < 2) return;
      if (
        Math.hypot(
          points[0][0] - points[points.length - 1][0],
          points[0][1] - points[points.length - 1][1],
        ) <= 0.01
      ) {
        return;
      }
      segments.push({ order, stageIndex, phase, kind, points });
      order += 1;
    };
    stages.forEach((stage, stageIndex) => {
      if (stage.mode === 'collinear') {
        appendSegment(stageIndex, 'group-entry', 'solid', [current, stage.orderedPoints[0]]);
        for (let index = 1; index < stage.orderedPoints.length; index += 1) {
          appendSegment(stageIndex, 'group-members', 'dash', [
            stage.orderedPoints[index - 1],
            stage.orderedPoints[index],
          ]);
        }
        current = stage.orderedPoints[stage.orderedPoints.length - 1];
        return;
      }
      if (stage.mode === 'multiline') {
        for (const line of stage.lineGroups ?? []) {
          if (line.length < 2) continue;
          appendSegment(stageIndex, 'group-entry', 'solid', [current, line[0]]);
          for (let index = 1; index < line.length; index += 1) {
            appendSegment(stageIndex, 'group-members', 'dash', [line[index - 1], line[index]]);
          }
          current = line[line.length - 1];
        }
        return;
      }
      const center = stage.center;
      if (!center) return;
      appendSegment(stageIndex, 'group-entry', 'solid', [current, center]);
      stage.orderedPoints.forEach((point) => {
        appendSegment(stageIndex, 'group-members', 'dash', [center, point]);
      });
      current = center;
    });
    if (targetPos) {
      appendSegment(stages.length, 'chest-entry', 'solid', [current, targetPos]);
    }

    return {
      kind: 'butterfly-path',
      anchorId,
      stages,
      ...(targetPos ? { targetPos } : {}),
      segments,
    };
  }

  if (recordCode === layout.records.unlockGroup) {
    const anchorId = decodeId(value[1]);
    const anchorPos = decodePoint(value[2]);
    const helperPoints = decodePoints(value[3]);
    if (!anchorId || !anchorPos || !helperPoints || helperPoints.length !== 3) return null;
    return {
      kind: 'unlock-group',
      anchorId,
      anchorPos,
      helpers: helperPoints.map((pos) => ({ pos })),
    };
  }

  if (recordCode === layout.records.trajectory) {
    const anchorId = decodeId(value[1]);
    const points = decodePoints(value[2]);
    if (!anchorId || !points || points.length < 2 || typeof value[3] !== 'boolean') return null;
    return { kind: 'trajectory', anchorId, points, closed: value[3] };
  }

  return null;
};
