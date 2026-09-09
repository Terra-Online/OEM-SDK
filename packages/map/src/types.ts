import type { OEMGameXZPosition, OEMManifest, OEMMapPosition, OEMPoint, OEMPointFilter, OEMPosition, OEMResources, OEMView } from '@opendfieldmap/core';

/** Optional static layers controlled independently by the host. */
export interface OEMFeatures {
  points?: boolean;
  labels?: boolean;
  boundaries?: boolean;
}

/** Low-level rendering options used by the public Widget package. */
export interface OEMOptions {
  resources: OEMResources;
  manifest?: OEMManifest;
  regionId?: string;
  floorId?: string;
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
/** Coordinates reported when the host selects a location on the map. */
export interface OEMMapClick {
  position: OEMMapPosition;
  game: OEMGameXZPosition;
}
/** Lifecycle events emitted by a low-level OEM map instance. */
export interface OEMEvents {
  click: OEMMapClick;
  viewchange: OEMView;
  regionchange: { regionId: string };
  floorchange: { floorId: string };
  loading: { feature: 'points' | 'labels' | 'boundaries'; loading: boolean };
  load: { regionId: string; floorId: string };
  error: Error;
}
/** Controls whether a programmatic zoom uses Leaflet's native transition. */
export interface OEMZoomOptions { animate?: boolean }
/**
 * The framework-agnostic OEM rendering kernel.
 *
 * The embeddable Widget exposes a smaller surface and does not pass through
 * Leaflet or map-layer objects.
 */
export interface OEM {
  readonly manifest: OEMManifest;
  readonly destroyed: boolean;
  getView(): OEMView;
  setView(view: OEMView): void;
  setZoom(zoom: number, options?: OEMZoomOptions): void;
  fitBounds(bounds: [OEMPosition, OEMPosition]): void;
  setRegion(regionId: string): Promise<void>;
  setFloor(floorId: string): void;
  setLocale(locale: string): Promise<void>;
  getLocale(): { requested: string; resolved: string };
  setTheme(theme: 'light' | 'dark'): void;
  setFeatures(features: OEMFeatures): Promise<void>;
  setPointFilter(filter: OEMPointFilter): void;
  setCustomPoints(points: readonly OEMCustomPoint[]): void;
  loadCustomPoints(url: string): Promise<void>;
  clearCustomPoints(): void;
  getPoint(pointId: string): OEMPoint | undefined;
  loadPoint(pointId: string): Promise<OEMPoint | undefined>;
  setMarkerClustering(enabled: boolean): void;
  resize(): void;
  on<Event extends keyof OEMEvents>(event: Event, handler: (payload: OEMEvents[Event]) => void): () => void;
  destroy(): void;
}
