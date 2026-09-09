import L from 'leaflet';
import 'leaflet.markercluster';
import {
  createOEMPointUrl,
  fetchOEMJson,
  fromOEMLeafletPosition,
  getOEMRegion,
  mapToGameXZPosition,
  normalizeOEMLocale,
  resolveOEMAsset,
  toOEMLeafletMapPosition,
  toOEMLeafletPosition,
} from '@opendfieldmap/core';
import type {
  OEMAsset,
  OEMBoundary,
  OEMBoundarySource,
  OEMFloor,
  OEMLabel,
  OEMLocaleMessages,
  OEMManifest,
  OEMPoint,
  OEMPointFilter,
  OEMMapPosition,
  OEMPointType,
  OEMPosition,
  OEMRegion,
  OEMView,
} from '@opendfieldmap/core';
import type { OEM as OEMContract, OEMClickPointOptions, OEMCustomPoint, OEMEvents, OEMFeatures, OEMOptions, OEMZoomOptions } from './types';
import { SmoothTileLayer } from './atlos/smoothTileLayer';
import { enableSmoothWheelZoom } from './atlos/smoothWheelZoom';
import { isMapOverdragged, toMapBounds } from './atlos/mapOverdrag';
import { appendOEMTileVersion, lookupOEMTile } from './tileVersion';
import GithubIcon from './assets/ghicon.svg';

const mounted = new WeakSet<HTMLElement>();
const CLUSTER_SUBCATEGORIES = new Set(['boss', 'collection', 'mob', 'natural', 'valuable', 'exploration']);
const FEATURE_NAMES = ['points', 'labels', 'boundaries'] as const;
type OEMFeatureName = typeof FEATURE_NAMES[number];
const BRAND_URL = 'https://oem.re/';
const GITHUB_URL = 'https://github.com/Terra-Online/OEM-SDK';
const TERMS_URL = 'https://blog.opendfieldmap.org/docs/tos#intellectual-property-and-copyright';

const cloneFilter = (filter: OEMPointFilter): OEMPointFilter => ({
  types: filter.types ? [...filter.types] : undefined,
  subregions: filter.subregions ? [...filter.subregions] : undefined,
  floorOnly: filter.floorOnly,
});

const sameList = (left?: string[], right?: string[]): boolean =>
  left === right || (!!left && !!right && left.length === right.length &&
    left.every((value, index) => value === right[index]));

const sameFilter = (left: OEMPointFilter, right: OEMPointFilter): boolean =>
  left.floorOnly === right.floorOnly &&
  sameList(left.types, right.types) &&
  sameList(left.subregions, right.subregions);

const clonePoint = (point: OEMPoint): OEMPoint => ({
  ...point,
  raw: { ...point.raw },
  position: { ...point.position },
});

const cloneCustomPoint = (point: OEMCustomPoint): OEMCustomPoint => ({
  ...point,
  position: { ...point.position },
});

type GeometryPoint = { x: number; z: number };

const pointOnSegment = (point: GeometryPoint, start: GeometryPoint, end: GeometryPoint): boolean => {
  const cross = (point.x - start.x) * (end.z - start.z) - (point.z - start.z) * (end.x - start.x);
  if (Math.abs(cross) > 1e-7) return false;
  return point.x >= Math.min(start.x, end.x) - 1e-7 && point.x <= Math.max(start.x, end.x) + 1e-7 &&
    point.z >= Math.min(start.z, end.z) - 1e-7 && point.z <= Math.max(start.z, end.z) + 1e-7;
};

const pointInRing = (point: GeometryPoint, ring: readonly GeometryPoint[]): boolean => {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index];
    const prior = ring[previous];
    if (pointOnSegment(point, prior, current)) return true;
    const crosses = (current.z > point.z) !== (prior.z > point.z);
    if (crosses && point.x < (prior.x - current.x) * (point.z - current.z) / (prior.z - current.z) + current.x) inside = !inside;
  }
  return inside;
};

const distanceSquaredToSegment = (point: GeometryPoint, start: GeometryPoint, end: GeometryPoint): number => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (!lengthSquared) return (point.x - start.x) ** 2 + (point.z - start.z) ** 2;
  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  const nearestX = start.x + projection * dx;
  const nearestZ = start.z + projection * dz;
  return (point.x - nearestX) ** 2 + (point.z - nearestZ) ** 2;
};

const boundaryScore = (boundary: OEMBoundary, point: GeometryPoint): { id: string; inside: boolean; distance: number } => {
  const rings = boundary.rings.map((ring) => ring as readonly GeometryPoint[]);
  const distances = rings.flatMap((ring) => ring.map((start, index) =>
    distanceSquaredToSegment(point, start, ring[(index + 1) % ring.length])));
  const insideOuter = rings.length > 0 && pointInRing(point, rings[0]);
  const insideHole = rings.slice(1).some((ring) => pointInRing(point, ring));
  return { id: boundary.id, inside: insideOuter && !insideHole, distance: Math.min(...distances, Infinity) };
};

/** Leaflet marker with the subpixel positioning used by Atlos. */
class OEMMarker extends L.Marker {
  update(): this {
    const marker = this as unknown as { _icon?: HTMLElement; _map?: L.Map; _latlng: L.LatLng; _setPos(point: L.Point): void };
    if (marker._icon && marker._map) marker._setPos(marker._map.latLngToLayerPoint(marker._latlng));
    return this;
  }
  _animateZoom(event: { center: L.LatLng; zoom: number }): void {
    const marker = this as unknown as {
      _map?: L.Map & { _latLngToNewLayerPoint(latlng: L.LatLng, zoom: number, center: L.LatLng): L.Point };
      _latlng: L.LatLng;
      _setPos(point: L.Point): void;
    };
    if (marker._map) marker._setPos(marker._map._latLngToNewLayerPoint(marker._latlng, event.zoom, event.center));
  }
}

/** Tile layer that skips coordinates absent from the published coverage index. */
class CoveredTileLayer extends SmoothTileLayer {
  constructor(url: string, options: L.TileLayerOptions, private coverage: OEMRegion['coverage'], private floor: OEMFloor) {
    super(url, options);
  }
  getTileUrl(coords: L.Coords): string {
    const tile = lookupOEMTile(this.coverage, this.floor, coords.z, coords.x, coords.y);
    return appendOEMTileVersion(super.getTileUrl(coords), tile.version);
  }
  _isValidTile(coords: L.Coords): boolean {
    const prototype = L.GridLayer.prototype as unknown as {
      _isValidTile(this: L.GridLayer, value: L.Coords): boolean;
    };
    return prototype._isValidTile.call(this, coords) &&
      lookupOEMTile(this.coverage, this.floor, coords.z, coords.x, coords.y).covered;
  }
}

/** Leaflet-backed implementation of the public OEM interface. */
export class OEM implements OEMContract {
  destroyed = false;
  private map: L.Map;
  private root: HTMLDivElement;
  private region: OEMRegion;
  private floorId = 'M';
  private features: OEMFeatures = {};
  private boundarySource: OEMBoundarySource = 'oem';
  private listeners = new Map<keyof OEMEvents, Set<(payload: never) => void>>();
  private requests = new Map<OEMFeatureName, AbortController>();
  private baseTiles?: L.TileLayer;
  private floorTiles?: L.TileLayer;
  private pointsLayer = L.layerGroup();
  private customPointsLayer = L.layerGroup();
  private pointClusters = new Map<string, L.MarkerClusterGroup>();
  private labelsLayer = L.layerGroup();
  private boundariesLayer = L.layerGroup();
  private points: OEMPoint[] = [];
  private customPoints: OEMCustomPoint[] = [];
  private clickPoints: OEMCustomPoint[] = [];
  private clickPointOptions?: OEMClickPointOptions;
  private clickPointSequence = 0;
  private customPointsRequest?: { controller: AbortController; promise: Promise<void> };
  private pointIndex?: Record<string, string>;
  private pointIndexRequest?: Promise<Record<string, string>>;
  private pointShardRequests = new Map<string, Promise<OEMPoint[]>>();
  private boundaryData = new Map<string, OEMBoundary[]>();
  private boundaryDataRequests = new Map<string, Promise<OEMBoundary[]>>();
  private types: Record<string, OEMPointType> = {};
  private labels: OEMLabel[] = [];
  private visibleLabelType?: OEMLabel['type'];
  private messages: OEMLocaleMessages = {};
  private filter: OEMPointFilter = {};
  private markerClustering: boolean;
  private locale: string;
  private resolvedLocale: string;
  private attributionBrand: HTMLAnchorElement;
  private attributionLink: HTMLAnchorElement;
  private observer?: ResizeObserver;
  private updatingView = false;
  private emittedView?: OEMView;
  private overdragFrame?: number;
  private overdragged = false;
  private wheel: ReturnType<typeof enableSmoothWheelZoom>;

  constructor(private container: HTMLElement, readonly manifest: OEMManifest, private options: OEMOptions) {
    if (mounted.has(container)) throw new Error('This container already hosts an OEM instance');
    this.region = getOEMRegion(manifest, options.view?.regionId ?? options.regionId ?? manifest.defaultRegionId);
    this.filter = cloneFilter(options.pointFilter ?? {});
    this.boundarySource = options.features?.boundarySource ?? 'oem';
    this.customPoints = this.normalizeCustomPoints(options.customPoints ?? []);
    this.markerClustering = options.markerClustering ?? true;
    const initialFloor = options.view?.floorId ?? options.floorId ?? 'M';
    this.validateFloor(initialFloor);
    if (options.view) this.validatePosition(options.view);
    this.locale = options.locale ?? manifest.fallbackLocale;
    this.resolvedLocale = normalizeOEMLocale(this.locale, Object.keys(manifest.locales), manifest.fallbackLocale);
    this.root = document.createElement('div');
    this.root.className = 'mapRoot';
    this.root.dataset.theme = options.theme ?? 'light';
    container.append(this.root);
    mounted.add(container);
    this.map = L.map(this.root, {
      crs: L.CRS.Simple, minZoom: 0, maxZoom: 3, zoomControl: false, attributionControl: false,
      dragging: !options.lockDrag, touchZoom: !options.lockZoom, boxZoom: !options.lockZoom,
      keyboard: !options.lockZoom, doubleClickZoom: false, scrollWheelZoom: false, zoomAnimation: true,
      markerZoomAnimation: true, fadeAnimation: true, zoomSnap: 0, zoomDelta: 0.25,
    });
    this.wheel = enableSmoothWheelZoom(this.map, {
      enableInertia: true,
      panEnabled: !options.lockDrag,
      zoomEnabled: !options.lockZoom,
    });
    const pane = this.map.createPane('placeLabels');
    pane.style.zIndex = '650';
    pane.style.pointerEvents = 'none';
    this.pointsLayer.addTo(this.map);
    this.customPointsLayer.addTo(this.map);
    this.labelsLayer.addTo(this.map);
    this.boundariesLayer.addTo(this.map);
    const credit = document.createElement('div');
    credit.className = 'attribution';
    const github = document.createElement('a');
    github.className = 'attributionGithub';
    github.href = GITHUB_URL;
    github.target = '_blank';
    github.rel = 'noopener noreferrer';
    github.setAttribute('aria-label', 'GitHub');
    github.innerHTML = GithubIcon;
    const githubSvg = github.querySelector('svg');
    githubSvg?.setAttribute('aria-hidden', 'true');
    githubSvg?.setAttribute('focusable', 'false');
    this.attributionBrand = document.createElement('a');
    this.attributionBrand.className = 'attributionBrand';
    this.attributionBrand.href = BRAND_URL;
    const separator = document.createElement('span');
    separator.className = 'attributionSeparator';
    separator.textContent = '·';
    separator.setAttribute('aria-hidden', 'true');
    this.attributionLink = document.createElement('a');
    this.attributionLink.className = 'attributionLink';
    this.attributionLink.href = TERMS_URL;
    this.attributionLink.target = '_blank';
    this.attributionLink.rel = 'noopener noreferrer';
    credit.append(github, this.attributionBrand, separator, this.attributionLink);
    this.updateAttribution();
    this.root.append(credit);
    this.applyRegion(options.view);
    this.setFloor(initialFloor);
    this.renderCustomPoints();
    this.map.on('click', this.emitMapClick);
    this.map.on('moveend zoomend', this.emitView);
    this.map.on('move drag', this.scheduleOverdragUpdate);
    this.map.on('moveend dragend movestart zoomstart', this.clearOverdrag);
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(container);
    }
    options.signal?.addEventListener('abort', this.destroy, { once: true });
  }

  /** Prevents calls against a released map instance. */
  private assertAlive(): void { if (this.destroyed) throw new Error('OEM instance has been destroyed'); }
  private validateFloor(id: string): void {
    if (!this.region.floors.some((floor) => floor.id === id)) throw new Error(`Unknown floor ${id} in ${this.region.id}`);
  }
  private validatePosition(position: OEMPosition): void { toOEMLeafletPosition(position, this.region); }
  private normalizeCustomPoints(points: readonly OEMCustomPoint[]): OEMCustomPoint[] {
    const ids = new Set<string>();
    return points.map((point) => {
      if (!point || typeof point.id !== 'string' || !point.id.trim()) {
        throw new Error(`Custom point IDs must be non-empty and unique: ${point?.id}`);
      }
      const id = point.id.trim();
      if (ids.has(id)) throw new Error(`Custom point IDs must be non-empty and unique: ${id}`);
      ids.add(id);
      if (!point.position || typeof point.position.regionId !== 'string') {
        throw new Error(`Invalid custom point position: ${id}`);
      }
      const position = point.position;
      if (point.style !== 'framed' && point.style !== 'no-frame') {
        throw new Error(`Invalid custom point style: ${id}`);
      }
      if (typeof point.icon !== 'string' || !point.icon) {
        throw new Error(`Custom point icon must be a non-empty URL: ${id}`);
      }
      const pointRegion = getOEMRegion(this.manifest, position.regionId);
      toOEMLeafletMapPosition(position);
      if (position.subregionId && !pointRegion.subregions.some((subregion) => subregion.id === position.subregionId)) {
        throw new Error(`Unknown custom point subregion ${position.subregionId} in ${position.regionId}`);
      }
      if (position.floorId && !pointRegion.floors.some((floor) => floor.id === position.floorId)) {
        throw new Error(`Unknown custom point floor ${position.floorId} in ${position.regionId}`);
      }
      return { ...cloneCustomPoint({ ...point, position }), id };
    });
  }
  private normalizeClickPointOptions(options: OEMClickPointOptions): OEMClickPointOptions {
    const probe: OEMCustomPoint = {
      id: 'click-point-option',
      position: { regionId: this.region.id, x: 0, z: 0 },
      style: options?.style,
      icon: options?.icon,
    };
    this.normalizeCustomPoints([probe]);
    if (options.mode !== 'multiple' && options.mode !== 'single') {
      throw new Error(`Invalid click point mode: ${options.mode}`);
    }
    return { mode: options.mode, style: options.style, icon: options.icon };
  }
  private position(latlng: L.LatLng): OEMPosition {
    return fromOEMLeafletPosition(latlng.lat, latlng.lng, this.region, this.floorId);
  }
  private loadOEMBoundaryData(reference: OEMAsset): Promise<OEMBoundary[]> {
    const cached = this.boundaryData.get(reference.path);
    if (cached) return Promise.resolve(cached);
    const pending = this.boundaryDataRequests.get(reference.path);
    if (pending) return pending;
    const request = fetchOEMJson<unknown>(resolveOEMAsset(this.options.resources.baseUrl, reference.path), this.options.signal).then((value) => {
      if (!Array.isArray(value)) throw new Error(`Invalid OEM boundary data: ${reference.path}`);
      const boundaries = value as OEMBoundary[];
      this.boundaryData.set(reference.path, boundaries);
      return boundaries;
    }).finally(() => {
      if (this.boundaryDataRequests.get(reference.path) === request) this.boundaryDataRequests.delete(reference.path);
    });
    this.boundaryDataRequests.set(reference.path, request);
    return request;
  }
  /** Preloads OEM subregion geometry so map clicks can resolve an exact subregion. */
  async prepareSubregionBoundaries(): Promise<void> {
    if (!this.region.boundaries) return;
    try { await this.loadOEMBoundaryData(this.region.boundaries); } catch { /* Click metadata has a bounds fallback. */ }
  }
  private inferSubregionId(x: number, z: number): string | undefined {
    const selected = this.filter.subregions?.filter((id) => this.region.subregions.some((subregion) => subregion.id === id));
    const scale = 2 ** this.region.maxNativeZoom;
    const point = { x: x * scale, z: z * scale };
    const allowed = selected?.length ? new Set(selected) : undefined;
    const geometries = this.region.boundaries ? this.boundaryData.get(this.region.boundaries.path) ?? [] : [];
    const scores = geometries
      .filter((boundary) => this.region.subregions.some((subregion) => subregion.id === boundary.id) && (!allowed || allowed.has(boundary.id)))
      .map((boundary) => boundaryScore(boundary, point));
    const inside = scores.filter((score) => score.inside);
    if (inside.length) {
      // Shared OEM polygons can overlap at block boundaries.  A point that is
      // close to a candidate's own boundary is close to that region's edge,
      // not deep inside its overall structure.  Resolve ambiguity by comparing
      // candidates pairwise and preferring the one with the greater boundary
      // clearance (the inverse of the old nearest-boundary rule).
      const ranked = inside.map((score) => ({ ...score, wins: 0, margin: 0 }));
      for (let leftIndex = 0; leftIndex < ranked.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < ranked.length; rightIndex += 1) {
          const left = ranked[leftIndex];
          const right = ranked[rightIndex];
          const delta = left.distance - right.distance;
          if (Math.abs(delta) <= 1e-9) continue;
          if (delta > 0) {
            left.wins += 1;
            left.margin += delta;
            right.margin -= delta;
          } else {
            right.wins += 1;
            right.margin -= delta;
            left.margin += delta;
          }
        }
      }
      ranked.sort((left, right) => right.wins - left.wins || right.margin - left.margin ||
        right.distance - left.distance || left.id.localeCompare(right.id));
      return ranked[0].id;
    }

    const bounds = this.region.subregions
      .filter((subregion) => subregion.bounds && (!allowed || allowed.has(subregion.id)))
      .map((subregion) => {
        const [[minX, minZ], [maxX, maxZ]] = subregion.bounds!;
        const insideX = point.x >= minX && point.x <= maxX;
        const insideZ = point.z >= minZ && point.z <= maxZ;
        const dx = insideX ? Math.min(point.x - minX, maxX - point.x) : Math.min(Math.abs(point.x - minX), Math.abs(point.x - maxX));
        const dz = insideZ ? Math.min(point.z - minZ, maxZ - point.z) : Math.min(Math.abs(point.z - minZ), Math.abs(point.z - maxZ));
        return { id: subregion.id, inside: insideX && insideZ, distance: dx * dx + dz * dz };
      })
      .sort((left, right) => Number(right.inside) - Number(left.inside) || left.distance - right.distance || left.id.localeCompare(right.id));
    if (bounds.length) return bounds[0].id;
    return scores.sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id))[0]?.id;
  }
  private emitMapClick = (event: L.LeafletMouseEvent): void => {
    if (this.destroyed) return;
    const subregionId = this.inferSubregionId(event.latlng.lng, event.latlng.lat);
    const position: OEMMapPosition = {
      regionId: this.region.id,
      x: event.latlng.lng,
      z: event.latlng.lat,
      floorId: this.floorId,
      ...(subregionId ? { subregionId } : {}),
    };
    if (this.clickPointOptions) {
      const point: OEMCustomPoint = {
        id: `oem-click-point-${++this.clickPointSequence}`,
        position,
        style: this.clickPointOptions.style,
        icon: this.clickPointOptions.icon,
      };
      if (this.clickPointOptions.mode === 'single') this.clickPoints = [point];
      else this.clickPoints.push(point);
      this.renderCustomPoints();
    }
    this.emit('click', { position, game: mapToGameXZPosition(position, this.region) });
  };
  private emit<Event extends keyof OEMEvents>(event: Event, payload: OEMEvents[Event]): void {
    this.listeners.get(event)?.forEach((handler) => handler(payload as never));
    if (event === 'error') this.options.onError?.(payload as Error);
  }
  private scheduleOverdragUpdate = (): void => {
    if (this.overdragFrame !== undefined) return;
    this.overdragFrame = requestAnimationFrame(() => {
      this.overdragFrame = undefined;
      const bounds = toMapBounds(this.map.options.maxBounds);
      const overdragged = !!bounds && isMapOverdragged(this.map, bounds);
      if (overdragged === this.overdragged) return;
      this.overdragged = overdragged;
      this.root.classList.toggle('overdrag', overdragged);
    });
  };
  private clearOverdrag = (): void => {
    if (this.overdragFrame !== undefined) cancelAnimationFrame(this.overdragFrame);
    this.overdragFrame = undefined;
    if (!this.overdragged) return;
    this.overdragged = false;
    this.root.classList.remove('overdrag');
  };
  /** Emits one resolved view for duplicate Leaflet move and zoom events. */
  private emitView = (): void => {
    if (this.destroyed || this.updatingView) return;
    const view = this.getView();
    if (this.emittedView && view.regionId === this.emittedView.regionId &&
      view.floorId === this.emittedView.floorId && view.x === this.emittedView.x &&
      view.z === this.emittedView.z && view.zoom === this.emittedView.zoom) return;
    this.emittedView = view;
    this.emit('viewchange', view);
    this.renderLabels();
  };
  /** Resolves the compact attribution without inheriting the map control font. */
  private updateAttribution(): void {
    const messages = this.manifest.controls[this.resolvedLocale] ?? this.manifest.controls[this.manifest.fallbackLocale];
    if (!messages) throw new Error('Missing OEM attribution messages');
    this.attributionBrand.textContent = messages.brandName;
    this.attributionLink.textContent = messages.termsOfService;
  }
  on<Event extends keyof OEMEvents>(event: Event, handler: (payload: OEMEvents[Event]) => void): () => void {
    this.assertAlive();
    const handlers = this.listeners.get(event) ?? new Set();
    handlers.add(handler as (payload: never) => void);
    this.listeners.set(event, handlers);
    return () => { handlers.delete(handler as (payload: never) => void); };
  }
  /** Rebuilds the base map constraints and main tile layer for one region. */
  private applyRegion(view?: OEMView): void {
    this.updatingView = true;
    this.baseTiles?.remove();
    this.floorTiles?.remove();
    this.floorTiles = undefined;
    this.floorId = 'M';
    this.map.setMaxBounds(L.latLngBounds([]));
    this.map.setMinZoom(this.region.minZoom);
    this.map.setMaxZoom(this.region.maxZoom);
    const target = view ?? this.region.initialView;
    this.map.setView(toOEMLeafletPosition(target, this.region), this.clampZoom(target.zoom), { animate: false });
    this.map.setMaxBounds(this.regionBounds());
    this.baseTiles = this.makeTiles('M').addTo(this.map);
    this.updatingView = false;
  }
  /** Converts the region's published pixel extent to Simple CRS bounds. */
  private regionBounds(): L.LatLngBounds {
    const { x, z } = this.region.boundsOffset;
    return L.latLngBounds(
      toOEMLeafletPosition({ regionId: this.region.id, x, z }, this.region),
      toOEMLeafletPosition({ regionId: this.region.id, x: x + this.region.dimensions[0], z: z + this.region.dimensions[1] }, this.region),
    );
  }
  /** Creates a coverage-aware layer for one region floor. */
  private makeTiles(floorId: string): L.TileLayer {
    const floor = this.region.floors.find((entry) => entry.id === floorId)!;
    const regionId = this.region.id;
    const layer = new CoveredTileLayer(resolveOEMAsset(this.options.resources.baseUrl, floor.tileTemplate), {
      tileSize: this.region.tileSize, noWrap: true, bounds: this.regionBounds(),
      maxNativeZoom: this.region.maxNativeZoom, maxZoom: Math.ceil(this.region.maxZoom),
    }, this.region.coverage, floor);
    layer.on('load', () => { if (!this.destroyed && this.region.id === regionId) this.emit('load', { regionId, floorId }); });
    layer.on('tileerror', () => this.emit('error', new Error(`Tile load failed: ${regionId}/${floorId}`)));
    return layer;
  }
  private clampZoom(zoom: number): number {
    if (!Number.isFinite(zoom)) throw new Error('Zoom must be finite');
    return Math.max(this.region.minZoom, Math.min(this.region.maxZoom, zoom));
  }
  /** Returns the current view in the OEM pixel coordinate system. */
  getView(): OEMView { this.assertAlive(); return { ...this.position(this.map.getCenter()), zoom: this.map.getZoom() }; }

  /** Sets the view without exposing Leaflet's coordinate objects. */
  setView(view: OEMView): void {
    this.assertAlive();
    this.validatePosition(view);
    const zoom = this.clampZoom(view.zoom);
    if (view.floorId) this.setFloor(view.floorId);
    this.map.setView(toOEMLeafletPosition(view, this.region), zoom, { animate: false });
  }
  /** Changes zoom around the current center with an optional native transition. */
  setZoom(zoom: number, options: OEMZoomOptions = {}): void {
    this.assertAlive();
    this.map.setZoom(this.clampZoom(zoom), { animate: options.animate ?? false });
  }
  /** Fits the map to an OEM pixel-coordinate extent. */
  fitBounds(bounds: [OEMPosition, OEMPosition]): void {
    this.assertAlive();
    this.map.fitBounds(L.latLngBounds(toOEMLeafletPosition(bounds[0], this.region), toOEMLeafletPosition(bounds[1], this.region)), { animate: false });
  }
  /** Switches regions and reloads only the features currently enabled. */
  async setRegion(regionId: string): Promise<void> {
    this.assertAlive();
    const region = getOEMRegion(this.manifest, regionId);
    if (region === this.region) return;
    this.cancelRequests();
    this.region = region;
    this.points = [];
    this.labels = [];
    this.visibleLabelType = undefined;
    this.clearPointLayers();
    this.labelsLayer.clearLayers();
    this.boundariesLayer.clearLayers();
    this.applyRegion();
    this.renderCustomPoints();
    this.emit('regionchange', { regionId });
    this.emit('floorchange', { floorId: 'M' });
    this.emitView();
    await this.prepareSubregionBoundaries();
    await this.loadFeatures();
  }
  /** Switches the rendered floor while retaining the current region view. */
  setFloor(floorId: string): void {
    this.assertAlive();
    this.validateFloor(floorId);
    if (floorId === this.floorId) return;
    this.floorTiles?.remove();
    this.floorTiles = undefined;
    this.floorId = floorId;
    const base = this.baseTiles?.getContainer();
    if (base) base.style.filter = floorId === 'M' ? 'brightness(1)' : 'brightness(0.5)';
    if (floorId !== 'M') this.floorTiles = this.makeTiles(floorId).addTo(this.map);
    this.renderPoints();
    this.renderCustomPoints();
    this.emit('floorchange', { floorId });
    this.emitView();
  }
  /** Changes label language and applies the manifest fallback chain. */
  async setLocale(locale: string): Promise<void> {
    this.assertAlive();
    const resolved = normalizeOEMLocale(locale, Object.keys(this.manifest.locales), this.manifest.fallbackLocale);
    const changed = resolved !== this.resolvedLocale;
    this.locale = locale;
    if (!changed) return;
    this.resolvedLocale = resolved;
    this.updateAttribution();
    if (this.features.labels) await this.loadFeature('labels');
  }
  /** Returns both the requested and resolved locale values. */
  getLocale(): { requested: string; resolved: string } { return { requested: this.locale, resolved: this.resolvedLocale }; }

  /** Changes only this instance's theme attribute. */
  setTheme(theme: 'light' | 'dark'): void { this.assertAlive(); this.root.dataset.theme = theme; }

  /** Enables or disables static layers and cancels disabled layer requests. */
  async setFeatures(features: OEMFeatures): Promise<void> {
    this.assertAlive();
    const loads: Promise<void>[] = [];
    if (features.boundarySource !== undefined) {
      if (features.boundarySource !== 'oem' && features.boundarySource !== 'game') {
        throw new Error(`Unknown OEM boundary source: ${features.boundarySource}`);
      }
      if (features.boundarySource !== this.boundarySource) {
        this.boundarySource = features.boundarySource;
        this.cancelRequest('boundaries');
        if (this.features.boundaries) loads.push(this.loadFeature('boundaries'));
      }
    }
    for (const feature of FEATURE_NAMES) {
      if (features[feature] === undefined || features[feature] === this.features[feature]) continue;
      this.features[feature] = features[feature];
      this.cancelRequest(feature);
      if (features[feature]) loads.push(this.loadFeature(feature));
      else if (feature === 'points') { this.points = []; this.clearPointLayers(); }
      else if (feature === 'labels') { this.labels = []; this.visibleLabelType = undefined; this.labelsLayer.clearLayers(); }
      else this.boundariesLayer.clearLayers();
    }
    await Promise.all(loads);
  }

  /** Replaces host-defined points without reloading static map data. */
  setCustomPoints(points: readonly OEMCustomPoint[]): void {
    this.assertAlive();
    this.customPointsRequest?.controller.abort();
    this.customPointsRequest = undefined;
    this.customPoints = this.normalizeCustomPoints(points);
    this.renderCustomPoints();
  }

  /** Enables or disables automatic custom-point creation from map clicks. */
  setClickPointMode(options?: OEMClickPointOptions | null): void {
    this.assertAlive();
    this.clickPointOptions = options == null ? undefined : this.normalizeClickPointOptions(options);
    if (this.clickPointOptions?.mode === 'single' && this.clickPoints.length > 1) {
      this.clickPoints = [this.clickPoints.at(-1)!];
      this.renderCustomPoints();
    }
  }

  /** Removes only points created by the click-point mode. */
  clearClickPoints(): void {
    this.assertAlive();
    if (!this.clickPoints.length) return;
    this.clickPoints = [];
    this.renderCustomPoints();
  }

  loadCustomPoints(url: string): Promise<void> {
    this.assertAlive();
    const value = url.trim();
    if (!value) throw new Error('Custom points URL must be a non-empty URL');
    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(value, document.baseURI).toString();
    } catch {
      throw new Error(`Invalid custom points URL: ${url}`);
    }
    this.customPointsRequest?.controller.abort();
    const controller = new AbortController();
    const abort = () => controller.abort();
    this.options.signal?.addEventListener('abort', abort, { once: true });
    const request: { controller: AbortController; promise: Promise<void> } = { controller, promise: Promise.resolve() };
    request.promise = fetchOEMJson<unknown>(resolvedUrl, controller.signal).then((value) => {
      if (!Array.isArray(value)) throw new Error('Custom points JSON must be an array');
      const points = value.map((point) => {
        if (!point || typeof point !== 'object' || typeof (point as { icon?: unknown }).icon !== 'string') return point as OEMCustomPoint;
        return {
          ...(point as OEMCustomPoint),
          icon: new URL((point as OEMCustomPoint).icon, resolvedUrl).toString(),
        };
      });
      if (controller.signal.aborted || this.destroyed) return;
      this.customPoints = this.normalizeCustomPoints(points);
      this.renderCustomPoints();
    }).finally(() => {
      this.options.signal?.removeEventListener('abort', abort);
      if (this.customPointsRequest === request) this.customPointsRequest = undefined;
    });
    this.customPointsRequest = request;
    return request.promise;
  }

  /** Removes all host-defined points from this map instance. */
  clearCustomPoints(): void {
    this.assertAlive();
    this.customPointsRequest?.controller.abort();
    this.customPointsRequest = undefined;
    this.customPoints = [];
    this.renderCustomPoints();
  }

  /** Returns a loaded published point from the current region, if available. */
  getPoint(pointId: string): OEMPoint | undefined {
    this.assertAlive();
    const id = pointId.trim();
    if (!id) throw new Error('Point ID must not be empty');
    const point = this.points.find((entry) => entry.id === id);
    return point ? clonePoint(point) : undefined;
  }

  /** Loads one published point by using the release point index when available. */
  async loadPoint(pointId: string): Promise<OEMPoint | undefined> {
    this.assertAlive();
    const id = pointId.trim();
    if (!id) throw new Error('Point ID must not be empty');
    const loaded = this.getPoint(id);
    if (loaded) return loaded;

    const pointIndex = await this.loadPointIndex();
    this.assertAlive();
    const paths = pointIndex[id]
      ? [pointIndex[id]]
      : this.manifest.pointIndex
        ? []
        : this.manifest.regions.flatMap((region) => region.points.map((ref) => ref.path));
    for (const path of paths) {
      const points = await this.loadPointShard(path);
      const point = points.find((entry) => entry.id === id);
      if (point) return clonePoint(point);
    }
    return undefined;
  }

  private async loadPointIndex(): Promise<Record<string, string>> {
    if (!this.manifest.pointIndex) return {};
    if (this.pointIndex) return this.pointIndex;
    if (!this.pointIndexRequest) {
      this.pointIndexRequest = fetchOEMJson<unknown>(
        resolveOEMAsset(this.options.resources.baseUrl, this.manifest.pointIndex.path),
        this.options.signal,
      ).then((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid OEM point index');
        const index: Record<string, string> = {};
        for (const [id, path] of Object.entries(value)) {
          if (!id || typeof path !== 'string' || !path) throw new Error(`Invalid OEM point index entry: ${id}`);
          resolveOEMAsset(this.options.resources.baseUrl, path);
          index[id] = path;
        }
        this.pointIndex = index;
        return index;
      }).catch((error) => {
        this.pointIndexRequest = undefined;
        throw error;
      });
    }
    return this.pointIndexRequest;
  }

  private loadPointShard(path: string): Promise<OEMPoint[]> {
    const cached = this.pointShardRequests.get(path);
    if (cached) return cached;
    const request = fetchOEMJson<unknown>(resolveOEMAsset(this.options.resources.baseUrl, path), this.options.signal).then((value) => {
      if (!Array.isArray(value)) throw new Error(`Invalid OEM point shard: ${path}`);
      return value as OEMPoint[];
    }).catch((error) => {
      if (this.pointShardRequests.get(path) === request) this.pointShardRequests.delete(path);
      throw error;
    });
    this.pointShardRequests.set(path, request);
    return request;
  }

  private cancelRequest(feature: OEMFeatureName): void {
    if (!this.requests.has(feature)) return;
    this.requests.get(feature)!.abort();
    this.requests.delete(feature);
    this.emit('loading', { feature, loading: false });
  }
  private cancelRequests(): void { for (const feature of this.requests.keys()) this.cancelRequest(feature); }
  private async loadFeatures(): Promise<void> {
    await Promise.all(FEATURE_NAMES.filter((feature) => this.features[feature]).map((feature) => this.loadFeature(feature)));
  }
  /** Loads one feature with a request token so stale responses are ignored. */
  private async loadFeature(feature: OEMFeatureName): Promise<void> {
    this.cancelRequest(feature);
    const request = new AbortController();
    this.requests.set(feature, request);
    this.emit('loading', { feature, loading: true });
    const read = <Data>(ref: OEMAsset) => fetchOEMJson<Data>(resolveOEMAsset(this.options.resources.baseUrl, ref.path), request.signal);
    try {
      if (feature === 'points') {
        const [groups, types] = await Promise.all([
          Promise.all(this.region.points.map((ref) => read<OEMPoint[]>(ref))),
          Object.keys(this.types).length ? this.types : read<Record<string, OEMPointType>>(this.manifest.types),
        ]);
        if (request.signal.aborted) return;
        this.points = groups.flat();
        this.types = types;
        this.renderPoints();
      } else if (feature === 'labels') {
        const [labels, messages] = await Promise.all([
          this.region.labels ? read<OEMLabel[]>(this.region.labels) : Promise.resolve([]),
          this.manifest.locales[this.resolvedLocale] ? read<OEMLocaleMessages>(this.manifest.locales[this.resolvedLocale]) : Promise.resolve({}),
        ]);
        if (request.signal.aborted) return;
        this.labels = labels;
        this.messages = messages;
        this.renderLabels(true);
      } else {
        const reference = this.boundarySource === 'game' ? this.region.gameBoundaries : this.region.boundaries;
        const boundaries = reference
          ? this.boundarySource === 'oem'
            ? await this.loadOEMBoundaryData(reference)
            : await read<OEMBoundary[]>(reference)
          : [];
        if (request.signal.aborted) return;
        this.renderBoundaries(boundaries);
      }
    } catch (error) {
      if (!request.signal.aborted) {
        this.features[feature] = false;
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    } finally {
      if (this.requests.get(feature) === request) {
        this.requests.delete(feature);
        this.emit('loading', { feature, loading: false });
      }
    }
  }
  /** Applies a client-side filter without making another network request. */
  setPointFilter(filter: OEMPointFilter): void {
    this.assertAlive();
    const next = cloneFilter(filter);
    if (sameFilter(this.filter, next)) return;
    this.filter = next;
    this.renderPoints();
  }

  /** Enables or disables Atlos-style marker clustering without reloading point data. */
  setMarkerClustering(enabled: boolean): void {
    this.assertAlive();
    if (enabled === this.markerClustering) return;
    this.markerClustering = enabled;
    this.renderPoints();
  }

  private clearPointLayers(): void {
    this.pointsLayer.clearLayers();
    for (const group of this.pointClusters.values()) {
      group.clearLayers();
      group.remove();
    }
    this.pointClusters.clear();
  }

  private createCustomPointVisual(point: OEMCustomPoint): HTMLElement {
    const inner = document.createElement('div');
    inner.className = point.style === 'no-frame' ? 'noFrameInner' : 'markerInner';
    inner.setAttribute('aria-label', point.id);
    if (point.position.floorId && point.position.floorId !== this.floorId) inner.classList.add('offLayer');
    const image = document.createElement('img');
    image.src = point.icon;
    image.alt = point.id;
    image.draggable = false;
    if (point.style === 'no-frame') {
      image.className = 'noFrameImage';
      inner.append(image);
    } else {
      const frame = document.createElement('div');
      frame.className = 'frameImage';
      frame.append(image);
      inner.append(frame);
    }
    return inner;
  }

  private renderCustomPoints(): void {
    this.customPointsLayer.clearLayers();
    for (const point of [...this.customPoints, ...this.clickPoints]) {
      if (point.position.regionId !== this.region.id) continue;
      const marker = new OEMMarker(toOEMLeafletMapPosition(point.position), {
        interactive: false,
        keyboard: false,
        bubblingMouseEvents: false,
        icon: L.divIcon({
          html: this.createCustomPointVisual(point),
          className: `${point.style === 'no-frame' ? 'noFrameMarkerIcon' : 'frameMarkerIcon'} incompleteMarker`,
          iconSize: point.style === 'no-frame' ? [50, 50] : [32, 32],
          iconAnchor: point.style === 'no-frame' ? [25, 25] : [16, 32],
        }),
      });
      marker.addTo(this.customPointsLayer);
    }
  }

  /** Builds the shared Atlos marker composition for points and cluster summaries. */
  private createMarkerVisual(type: OEMPointType, point?: OEMPoint, count?: number): HTMLElement {
    const inner = document.createElement(point ? 'a' : 'div');
    inner.className = type.noFrame ? 'noFrameInner' : 'markerInner';
    if (point) {
      const link = inner as HTMLAnchorElement;
      link.href = createOEMPointUrl(point.id);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      inner.classList.toggle('offLayer', point.position.floorId !== this.floorId);
      if (point.tier) inner.dataset.tier = point.position.floorId;
    }
    if (count !== undefined) inner.classList.add('clusterMarker');
    const image = document.createElement('img');
    image.src = resolveOEMAsset(this.options.resources.baseUrl, type.icon);
    image.alt = type.key;
    image.draggable = false;
    if (type.noFrame) {
      image.className = 'noFrameImage';
      inner.append(image);
    } else {
      const frame = document.createElement('div');
      frame.className = 'frameImage';
      frame.append(image);
      inner.append(frame);
    }
    if (type.subIcon) {
      const sub = document.createElement('div');
      sub.className = 'subIconContainer';
      const subImage = document.createElement('img');
      subImage.className = 'subIcon';
      subImage.src = resolveOEMAsset(this.options.resources.baseUrl, type.subIcon);
      subImage.alt = '';
      sub.append(subImage);
      inner.append(sub);
    }
    if (count !== undefined) {
      const badge = document.createElement('span');
      badge.className = 'clusterCount';
      badge.textContent = String(count);
      inner.append(badge);
    }
    return inner;
  }

  private createPointMarker(point: OEMPoint, type: OEMPointType): OEMMarker {
    return new OEMMarker(toOEMLeafletPosition(point.position, this.region), {
      interactive: true, keyboard: false, bubblingMouseEvents: false,
      icon: L.divIcon({ html: this.createMarkerVisual(type, point),
        className: `${type.noFrame ? 'noFrameMarkerIcon' : 'frameMarkerIcon'} incompleteMarker`,
        iconSize: type.noFrame ? [50, 50] : [32, 32], iconAnchor: type.noFrame ? [25, 25] : [16, 32] }),
    });
  }

  private createPointCluster(type: OEMPointType): L.MarkerClusterGroup {
    return L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: !this.options.lockZoom,
      spiderfyOnMaxZoom: !this.options.lockZoom,
      disableClusteringAtZoom: 2,
      maxClusterRadius: 60,
      iconCreateFunction: (cluster) => L.divIcon({
        html: this.createMarkerVisual(type, undefined, cluster.getChildCount()),
        className: `${type.noFrame ? 'noFrameMarkerIcon' : 'frameMarkerIcon'} markerClusterCustom`,
        iconSize: type.noFrame ? [50, 50] : [32, 32],
        iconAnchor: type.noFrame ? [25, 25] : [16, 32],
      }),
    });
  }

  /** Rebuilds visible markers and groups eligible types with Atlos clustering rules. */
  private renderPoints(): void {
    this.clearPointLayers();
    const types = this.filter.types ? new Set(this.filter.types) : undefined;
    const subregions = this.filter.subregions ? new Set(this.filter.subregions) : undefined;
    for (const point of this.points) {
      if (types && !types.has(point.type)) continue;
      if (subregions && !subregions.has(point.subregionId)) continue;
      if (this.filter.floorOnly && point.position.floorId !== this.floorId) continue;
      const type = this.types[point.type];
      if (!type) continue;
      const marker = this.createPointMarker(point, type);
      if (this.markerClustering && CLUSTER_SUBCATEGORIES.has(type.category.sub)) {
        let group = this.pointClusters.get(type.key);
        if (!group) {
          group = this.createPointCluster(type);
          this.pointClusters.set(type.key, group);
        }
        group.addLayer(marker);
      } else marker.addTo(this.pointsLayer);
    }
    for (const group of this.pointClusters.values()) if (group.getLayers().length) group.addTo(this.map);
  }

  /** Renders Atlos-style fill and dashed stroke layers for published subregions. */
  private renderBoundaries(boundaries: OEMBoundary[]): void {
    this.boundariesLayer.clearLayers();
    for (const boundary of boundaries) {
      const rings = boundary.rings.map((ring) => ring.map((position) => toOEMLeafletPosition(position, this.region)));
      L.polygon(rings, { color: 'transparent', fillOpacity: 0.2, interactive: false,
        className: 'subregionBoundaryFill' }).addTo(this.boundariesLayer);
      L.polygon(rings, { weight: 2, opacity: 0.8, fill: false, interactive: false,
        className: 'subregionBoundaryStroke' }).addTo(this.boundariesLayer);
    }
  }
  /** Renders Atlos site or subregion labels according to the current zoom. */
  private renderLabels(force = false): void {
    const showSub = this.map.getZoom() <= 0.25 && this.labels.some((label) => label.type === 'sub');
    const visibleType: OEMLabel['type'] = showSub ? 'sub' : 'site';
    if (!force && visibleType === this.visibleLabelType) return;
    this.visibleLabelType = visibleType;
    this.labelsLayer.clearLayers();
    for (const label of this.labels) {
      if (label.type !== visibleType) continue;
      const inner = document.createElement('div');
      inner.className = label.type === 'sub' ? 'innerSub' : 'innerSite';
      inner.textContent = this.messages[label.textKey] ?? label.id.split('/').at(-1) ?? label.id;
      new OEMMarker(toOEMLeafletPosition(label.position, this.region), {
        pane: 'placeLabels', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'mapLabel', html: inner, iconSize: [0, 0] }),
      }).addTo(this.labelsLayer);
    }
  }
  /** Recalculates Leaflet dimensions after the host element changes size. */
  resize(): void { if (!this.destroyed) this.map.invalidateSize({ animate: false }); }

  /** Releases listeners, observers, pending requests, layers and DOM nodes. */
  destroy = (): void => {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelRequests();
    this.customPointsRequest?.controller.abort();
    this.customPointsRequest = undefined;
    if (this.overdragFrame !== undefined) cancelAnimationFrame(this.overdragFrame);
    this.observer?.disconnect();
    this.wheel.dispose();
    this.options.signal?.removeEventListener('abort', this.destroy);
    this.listeners.clear();
    this.map.remove();
    this.root.remove();
    this.points = [];
    this.customPoints = [];
    this.clickPoints = [];
    this.clickPointOptions = undefined;
    this.customPointsLayer.clearLayers();
    this.pointShardRequests.clear();
    mounted.delete(this.container);
  };
}
