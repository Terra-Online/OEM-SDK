/** Current static manifest schema accepted by OEM clients. */
export const OEM_SCHEMA_VERSION = 1 as const;

/**
 * A position in the published region pixel coordinate system.
 *
 * Coordinates are expressed at the region maximum native zoom and are not
 * interchangeable with geographic latitude/longitude values.
 */
export interface OEMPosition {
  regionId: string;
  subregionId?: string;
  x: number;
  z: number;
  floorId?: string;
}

/** A normalized map position, equivalent to published coordinates divided by the native scale. */
export interface OEMMapPosition {
  regionId: string;
  subregionId?: string;
  x: number;
  z: number;
  floorId?: string;
}

/** A horizontal map offset in the published region coordinate system. */
export interface OEMMapOffset { x: number; z: number }

/** A game-space position retained alongside its rendered map position. */
export interface OEMGamePosition {
  x: number;
  y: number;
  z: number;
}

/** The horizontal game-space coordinates recoverable from a 2D map position. */
export interface OEMGameXZPosition {
  x: number;
  z: number;
}

/** A pixel position relative to the map host element. */
export interface OEMScreenPosition { x: number; y: number }

/** A map position with a fractional zoom level. */
export interface OEMView extends OEMPosition { zoom: number }

/** An inclusive rectangular extent in region pixel coordinates. */
export type OEMPixelBounds = [[number, number], [number, number]];

/** Linear transform between Atlos map coordinates and game X/Z coordinates. */
export interface OEMGameTransform {
  scaleX: number;
  scaleZ: number;
  offsetX: number;
  offsetZ: number;
}

/** A versioned static asset reference with integrity metadata. */
export interface OEMAsset { path: string; sha256: string; bytes: number }

/** A published floor and its tile URL template. Versions align with covered x coordinates in each row. */
export interface OEMFloor {
  id: string;
  tileTemplate: string;
  tileVersions?: Record<string, Record<string, string[]>>;
}
/** A selectable subregion and its localized display names. */
export interface OEMSubregion {
  id: string;
  key: string;
  bounds?: OEMPixelBounds;
  gameTransform?: OEMGameTransform;
  locales?: Record<string, { name: string; short: string }>;
}
/** A webfont that may be loaded from the static origin after authorization. */
export interface OEMFontAsset extends OEMAsset {
  family: string;
  weight: number;
  /** Variable-font range, when the source font exposes a wght axis. */
  weightRange?: [number, number];
  style: 'normal';
}
/** Complete static configuration for one top-level map region. */
export interface OEMRegion {
  id: string;
  name: string;
  locales: Record<string, string>;
  dimensions: [number, number];
  boundsOffset: OEMMapOffset;
  tileSize: number;
  minZoom: number;
  maxNativeZoom: number;
  maxZoom: number;
  initialView: OEMView;
  floors: OEMFloor[];
  subregions: OEMSubregion[];
  gameTransform?: OEMGameTransform;
  points: OEMAsset[];
  labels?: OEMAsset;
  boundaries?: OEMAsset;
  /** Official game-space level-grid boundaries converted to OEM map coordinates. */
  gameBoundaries?: OEMAsset;
  coverage: Record<string, Record<string, Record<string, number[]>>>;
}
/** Localized strings used by the Atlos-aligned controls. */
export interface OEMControlMessages {
  layerSelect: string;
  zoomIn: string;
  zoomOut: string;
  /** Localized product name used by the built-in attribution. */
  brandName: string;
  /** Localized label for the built-in terms link. */
  termsOfService: string;
}

/** The versioned static release consumed by the SDK. */
export interface OEMManifest {
  schemaVersion: typeof OEM_SCHEMA_VERSION;
  /** Path-safe Endfield game version, for example 1_5_3. */
  gameVersion: string;
  releaseId: string;
  generatedAt: string;
  defaultRegionId: string;
  regions: OEMRegion[];
  types: OEMAsset;
  pointIndex?: OEMAsset;
  fonts?: OEMFontAsset[];
  fontLicense?: OEMAsset;
  fontLicenses?: OEMAsset[];
  locales: Record<string, OEMAsset>;
  controls: Record<string, OEMControlMessages>;
  fallbackLocale: string;
  source: { repository: string; commit: string; usage: string };
}
/** The static origin and release channel used by an OEM client. */
export interface OEMResources {
  baseUrl: string;
  manifestPath: string;
}
/** A normalized published point of interest. */
export interface OEMPoint {
  id: string;
  regionId: string;
  subregionId: string;
  type: string;
  tier: number;
  raw: OEMGamePosition;
  position: OEMPosition;
}
/** Static rendering metadata for one point type. */
export interface OEMPointType {
  key: string;
  noFrame?: boolean;
  icon: string;
  subIcon?: string;
  category: { main: string; sub: string };
}
/** Client-side point filtering applied to loaded region data. */
export interface OEMPointFilter { types?: string[]; subregions?: string[]; floorOnly?: boolean }

/** A non-interactive localized map label. */
export interface OEMLabel { id: string; type: 'site' | 'sub'; position: OEMPosition; textKey: string }

/** One coordinate in a boundary asset; the owning region comes from its manifest reference. */
export interface OEMBoundaryPoint { x: number; z: number }
/** A non-interactive region boundary composed of one or more rings. */
export interface OEMBoundary { id: string; rings: OEMBoundaryPoint[][] }
/** Published boundary file shared by OEM and game-derived boundary sources. */
export interface OEMBoundaryCollection { count: number; boundaries: OEMBoundary[] }

/** Selects the source used for the optional boundary layer. */
export type OEMBoundarySource = 'oem' | 'game';

/** Flattened locale messages published for labels and static UI. */
export type OEMLocaleMessages = Record<string, string>;
