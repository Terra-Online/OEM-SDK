import type { OEMBoundarySource, OEMManifest, OEMPoint, OEMResources } from '@opendfieldmap/core';
export type { OEMBoundarySource } from '@opendfieldmap/core';
import type { OEMClickPointOptions, OEMCustomPoint, OEMMapClick } from '@opendfieldmap/map';

/** Stable top-level region identifiers published by OEM. */
export type OEMRegionId = 'Valley_4' | 'Wuling' | 'Dijiang' | 'Weekraid_1';

/** Short region aliases accepted for parity with existing OEM links. */
export type OEMRegionCode = 'VL' | 'WL' | 'DJ' | 'ES';

/** Region values accepted by the Widget configuration. */
export type OEMRegionSelector = OEMRegionId | OEMRegionCode;

/** Floor identifiers currently used by OEM tile sets. */
export type OEMFloorId = 'M' | 'L1' | 'L2' | 'L3' | 'L4' | 'B1' | 'B2' | 'B3' | 'B4';

/** Locales with complete place-name data in the current static release. */
export type OEMLocale =
  | 'en-US'
  | 'zh-CN'
  | 'zh-HK'
  | 'ja-JP'
  | 'ko-KR'
  | 'ru-RU'
  | 'es-ES'
  | 'fr-FR'
  | 'de-DE'
  | 'it-IT'
  | 'id-ID'
  | 'pt-BR'
  | 'th-TH'
  | 'vi-VN';

/** Center coordinates in the selected region's max-native-zoom pixel space. */
export interface OEMWidgetCenter {
  x: number;
  z: number;
}

/**
 * Declarative content and initial-view configuration.
 *
 * Omitted values use the defaults documented on each property.
 */
export interface OEMWidgetConfig {
  /** Initial region. Defaults to the manifest's default region. */
  region?: OEMRegionSelector;
  /** Initial subregion ID. Defaults to the complete region (null). */
  subregion?: string | null;
  /** Initial floor. Defaults to M. */
  floor?: OEMFloorId;
  /** Place-name locale. Defaults to the closest supported browser locale. */
  locale?: OEMLocale;
  /** Marker type keys to show, * for all, or false for none. Defaults to false. */
  markerTypes?: readonly string[] | '*' | false;
  /** Whether place names are loaded and displayed. Defaults to true. */
  labels?: boolean;
  /** Whether subregion boundaries are loaded and displayed. Defaults to false. */
  boundaries?: boolean;
  /** Boundary data source. Defaults to Atlos/OEM boundaries. */
  boundarySource?: OEMBoundarySource;
  /** Whether nearby markers are grouped by point type. Defaults to true. */
  markerClustering?: boolean;
  /** Host-defined points rendered above the static map data. */
  customPoints?: readonly OEMCustomPoint[];
  /** URL of a JSON array of host-defined points. It replaces customPoints. */
  customPointsUrl?: string;
  /** Initial zoom, clamped to the selected region's supported range. Defaults to the region preset. */
  zoom?: number;
  /** Initial map center. Defaults to the selected region or subregion preset. */
  center?: OEMWidgetCenter;
}

/** Complete creation options for an embeddable OEM Widget. */
export interface OEMWidgetOptions extends OEMWidgetConfig {
  /** Static CDN endpoints. Defaults to the planned OEM production endpoints. */
  resources?: OEMResources;
  /** Preloaded manifest for tests or controlled hosts. */
  manifest?: OEMManifest;
  /** Whether the Atlos-aligned region and subregion selector is shown. Defaults to true. */
  showRegionSelector?: boolean;
  /** Whether the Atlos-aligned floor selector is shown. Defaults to true. */
  showFloorSelector?: boolean;
  /** Whether the Atlos-aligned scale bar is shown. Defaults to true. */
  showScaleBar?: boolean;
  /** Prevents user drag and trackpad-pan gestures. Defaults to false. */
  lockDrag?: boolean;
  /** Prevents user wheel, pinch, keyboard, double-click, and scale-bar zoom. Defaults to false. */
  lockZoom?: boolean;
  /** Visual theme. Defaults to light. */
  theme?: 'light' | 'dark';
  /** Optional class added to the Widget root. */
  className?: string;
  /** Aborts creation and destroys the Widget when triggered. */
  signal?: AbortSignal;
  onReady?: (widget: OEMWidget) => void;
  onStateChange?: (state: OEMWidgetState) => void;
  onError?: (error: Error) => void;
}

/** Fully resolved runtime state emitted by an OEM Widget. */
export interface OEMWidgetState {
  regionId: OEMRegionId;
  subregionId: string | null;
  floorId: OEMFloorId;
  locale: OEMLocale;
  markerTypes: string[] | '*';
  labels: boolean;
  boundaries: boolean;
  boundarySource: OEMBoundarySource;
  markerClustering: boolean;
  zoom: number;
  center: OEMWidgetCenter;
}

/** Events exposed by the embeddable Widget. */
export interface OEMWidgetEvents {
  click: OEMMapClick;
}

/**
 * Restricted Widget handle exposed to host applications.
 *
 * It intentionally does not expose Leaflet, custom point interaction, or drawing.
 */
export interface OEMWidget {
  readonly destroyed: boolean;
  getState(): OEMWidgetState;
  setOptions(options: OEMWidgetConfig): Promise<void>;
  setCustomPoints(points: readonly OEMCustomPoint[]): void;
  setClickPointMode(options?: OEMClickPointOptions | null): void;
  clearClickPoints(): void;
  loadCustomPoints(url: string): Promise<void>;
  clearCustomPoints(): void;
  getPoint(pointId: string): OEMPoint | undefined;
  loadPoint(pointId: string): Promise<OEMPoint | undefined>;
  on<Event extends keyof OEMWidgetEvents>(event: Event, handler: (payload: OEMWidgetEvents[Event]) => void): () => void;
  resize(): void;
  destroy(): void;
}
