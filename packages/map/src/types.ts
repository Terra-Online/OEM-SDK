import type { OEMCoordinateSnapshot, OEMScreenPosition, OEMBoundarySource, OEMGameXZPosition, OEMManifest, OEMMapPosition, OEMPoint, OEMPointFilter, OEMPosition, OEMResources, OEMView } from '@opendfieldmap/core';

/** Optional static layers controlled independently by the host. */
export interface OEMFeatures {
  points?: boolean;
  labels?: boolean;
  boundaries?: boolean;
  boundarySource?: OEMBoundarySource;
}

/** Low-level rendering options used by the public Widget package. */
export interface OEMOptions {
  resources: OEMResources;
  manifest?: OEMManifest;
  regionId?: string;
  floorId?: string;
  subregionId?: string | null;
  locale?: string;
  theme?: 'light' | 'dark';
  view?: OEMView;
  features?: OEMFeatures;
  pointFilter?: OEMPointFilter;
  /** Runtime points supplied by the host and rendered above static map data. */
  customPoints?: readonly OEMCustomPoint[];
  /** URL of a JSON array of runtime points, loaded before creation resolves. */
  customPointsUrl?: string;
  /** Groups nearby markers by point type. Defaults to true. */
  markerClustering?: boolean;
  /** Prevents user drag and trackpad-pan gestures without blocking programmatic view changes. */
  lockDrag?: boolean;
  /** Prevents user zoom gestures without blocking programmatic view changes. */
  lockZoom?: boolean;
  signal?: AbortSignal;
  onError?: (error: Error) => void;
}

/** A host-defined point rendered in the OEM map coordinate system. */
export interface OEMCustomPoint {
  id: string;
  position: OEMMapPosition;
  /** The only supported custom marker compositions, matching Atlos. */
  style: 'framed' | 'no-frame';
  /** Image URL used by the Atlos marker composition. */
  icon: string;
}

/** Visual configuration for points created from map clicks. */
export interface OEMClickPointOptions {
  /** Keeps every clicked point, or replaces the previous clicked point. */
  mode: 'multiple' | 'single';
  style: OEMCustomPoint['style'];
  icon: string;
}
/** Clicks carry reusable coordinates; subscribing never changes the point collection. */
export interface OEMMapClick extends OEMCoordinateSnapshot {
  /** Compatibility name for mapPosition. */
  readonly position: Readonly<OEMMapPosition>;
  /** Compatibility name for gamePosition; null when conversion is not reliable. */
  readonly game: Readonly<OEMGameXZPosition> | null;
}
export type OEMPointTarget = { source: 'published'; point: OEMPoint } | { source: 'custom'; point: OEMCustomPoint };
export type OEMPointInteraction = OEMPointTarget & {
  coordinates: OEMCoordinateSnapshot;
  trigger: 'pointer' | 'keyboard';
};
export type OEMPointActivation = OEMPointInteraction & {
  readonly defaultPrevented: boolean;
  preventDefault(): void;
};
export interface OEMCommandOptions { signal?: AbortSignal }
export interface OEMInteractionLocks { lockDrag?: boolean; lockZoom?: boolean }
/** Flat configuration remains supported; grouping is a separate migration. */
export interface OEMMapConfig extends OEMInteractionLocks {
  region?: string;
  subregion?: string | null;
  floor?: string;
  locale?: string;
  markerTypes?: readonly string[] | '*' | false;
  labels?: boolean;
  boundaries?: boolean;
  boundarySource?: OEMBoundarySource;
  markerClustering?: boolean;
  customPoints?: readonly OEMCustomPoint[];
  customPointsUrl?: string;
  zoom?: number;
  center?: { x: number; z: number };
  theme?: 'light' | 'dark';
}
export interface OEMMapState {
  regionId: string;
  subregionId: string | null;
  floorId: string;
  locale: string;
  markerTypes: string[] | '*';
  labels: boolean;
  boundaries: boolean;
  boundarySource: OEMBoundarySource;
  markerClustering: boolean;
  zoom: number;
  center: { x: number; z: number };
  theme: 'light' | 'dark';
  lockDrag: boolean;
  lockZoom: boolean;
}
/** Requested visibility is independent of a layer's resource status. */
export type OEMFeatureName = 'points' | 'labels' | 'boundaries';
export interface OEMResourceState {
  requested: boolean;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: Error;
}
export type OEMResourceStates = Record<OEMFeatureName, OEMResourceState>;

/** Lifecycle events emitted by a low-level OEM map instance. */
export interface OEMEvents {
  click: OEMMapClick;
  statechange: OEMMapState;
  pointclick: OEMPointActivation;
  pointenter: OEMPointInteraction;
  pointleave: OEMPointInteraction;
  custompointschange: { added: string[]; updated: string[]; removed: string[] };
  destroy: undefined;
  viewchange: OEMView;
  regionchange: { regionId: string };
  floorchange: { floorId: string };
  loading: { feature: 'points' | 'labels' | 'boundaries'; loading: boolean };
  load: { regionId: string; floorId: string };
  resourcechange: { feature: OEMFeatureName; state: OEMResourceState };
  error: Error;
}
/** Controls whether a programmatic zoom uses Leaflet's native transition. */
export interface OEMZoomOptions { animate?: boolean }
/**
 * The framework-agnostic OEM rendering kernel.
 *
 * The Widget exposes this same surface through widget.map. Leaflet and
 * renderer objects remain internal.
 */
export interface OEMMapAPI {
  getState(): OEMMapState;
  update(config: OEMMapConfig): Promise<void>;
  setSubregion(subregionId: string | null): Promise<void>;
  setInteractionLocks(locks: OEMInteractionLocks): Promise<void>;
  project(position: OEMMapPosition): OEMScreenPosition;
  unproject(position: OEMScreenPosition): OEMMapClick;
  getCustomPoints(): OEMCustomPoint[];
  getCustomPoint(id: string): OEMCustomPoint | undefined;
  upsertCustomPoints(points: readonly OEMCustomPoint[], options?: OEMCommandOptions): Promise<void>;
  removeCustomPoints(ids: readonly string[], options?: OEMCommandOptions): Promise<void>;
  readonly manifest: OEMManifest;
  readonly destroyed: boolean;
  getView(): OEMView;
  setView(view: OEMView): Promise<void>;
  setZoom(zoom: number, options?: OEMZoomOptions): Promise<void>;
  fitBounds(bounds: [OEMPosition, OEMPosition]): Promise<void>;
  setRegion(regionId: string): Promise<void>;
  setFloor(floorId: string): Promise<void>;
  setLocale(locale: string): Promise<void>;
  getLocale(): { requested: string; resolved: string };
  setTheme(theme: 'light' | 'dark'): Promise<void>;
  setFeatures(features: OEMFeatures): Promise<void>;
  getResourceState(): OEMResourceStates;
  /** Retry requested layers whose last load failed. */
  retry(feature?: OEMFeatureName): Promise<void>;
  getPointFilter(): OEMPointFilter;
  setPointFilter(filter: OEMPointFilter): Promise<void>;
  setCustomPoints(points: readonly OEMCustomPoint[], options?: OEMCommandOptions): Promise<void>;
  loadCustomPoints(url: string, options?: OEMCommandOptions): Promise<void>;
  clearCustomPoints(): Promise<void>;
  getPoint(pointId: string): OEMPoint | undefined;
  loadPoint(pointId: string): Promise<OEMPoint | undefined>;
  setMarkerClustering(enabled: boolean): Promise<void>;
  resize(): void;
  on<Event extends keyof OEMEvents>(event: Event, handler: (payload: OEMEvents[Event]) => void): () => void;
  destroy(): void;
}

/** Compatibility type name for the shared public map API. */
export type OEM = OEMMapAPI;
