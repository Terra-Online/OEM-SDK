import type { OEMBoundarySource, OEMManifest, OEMPoint, OEMResources } from '@opendfieldmap/core';
export type { OEMBoundarySource } from '@opendfieldmap/core';
import type { OEMCustomPoint, OEMFeatureName, OEMResourceStates, OEMEvents, OEMMapAPI, OEMMapState, OEMMapConfig } from '@opendfieldmap/map';

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

/** Widget content uses the same configuration contract as the map API. */
export interface OEMWidgetConfig extends OEMMapConfig {}

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
  /** Places the region and floor selectors in a horizontal rail at the top. Defaults to false. */
  horizontalSelectors?: boolean;
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

export type OEMWidgetState = OEMMapState;
export type OEMWidgetEvents = OEMEvents;

/**
 * Official Widget plus its shared, framework-independent behavior API.
 * Leaflet and visual customization are not exposed.
 */
export interface OEMWidget {
  readonly destroyed: boolean;
  readonly map: OEMMapAPI;
  getState(): OEMWidgetState;
  getResourceState(): OEMResourceStates;
  retry(feature?: OEMFeatureName): Promise<void>;
  setOptions(options: OEMWidgetConfig): Promise<void>;
  setCustomPoints(points: readonly OEMCustomPoint[]): Promise<void>;
  loadCustomPoints(url: string): Promise<void>;
  clearCustomPoints(): Promise<void>;
  getPoint(pointId: string): OEMPoint | undefined;
  loadPoint(pointId: string): Promise<OEMPoint | undefined>;
  on<Event extends keyof OEMWidgetEvents>(event: Event, handler: (payload: OEMWidgetEvents[Event]) => void): () => void;
  resize(): void;
  destroy(): void;
}
