import L from 'leaflet';
import {
  createOEMPointUrl,
  createOEMCoordinateSnapshot,
  toOEMMapPosition,
  invalid,
  OEMError,
  resourceError,
  withOEMAbort,
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
  OEMCoordinateSnapshot,
  OEMScreenPosition,
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
import type { OEM as OEMContract, OEMCustomPoint, OEMEvents, OEMFeatures, OEMOptions, OEMZoomOptions, OEMResourceStates, OEMResourceState, OEMMapClick, OEMMapConfig, OEMMapState, OEMCommandOptions, OEMInteractionLocks, OEMPointInteraction, OEMPointActivation } from '../types';
import { cloneConfig, validateConfig, normalizeState, toConfig, getPreset, resolveRegionId, hasMarkers, sameState } from '../config';
import { enableSmoothWheelZoom } from '../atlos/smoothWheelZoom';
import { isMapOverdragged, toMapBounds } from '../atlos/mapOverdrag';
import GithubIcon from '../assets/ghicon.svg';
import { boundaryScore, parseBoundaryCollection } from './geometry';
import { ViewportMarker } from '../atlos/markerViewport';
import { createCanvasAwareClusterGroup } from '../atlos/canvasMarkerCluster';
import type { CanvasClusterGroup } from '../atlos/clusterGroup';
import { CoveredTileLayer, OEMMarker } from './layers';
import {
  BRAND_URL,
  CLUSTER_SUBCATEGORIES,
  cloneCustomPoint,
  cloneFilter,
  clonePoint,
  FEATURE_NAMES,
  GITHUB_URL,
  sameFilter,
  TERMS_URL,
  type OEMFeatureName,
} from './helpers';

const mounted = new WeakSet<HTMLElement>();

type AtlosPointTuple = [string | number, number, number, number, number, string | null];
type AtlosPointObject = { id: string | number; z?: number; x?: number; y?: number; tier?: number; pos?: number[]; subregId?: string; type?: string | null };

/** Decodes the compact tuple/object format used by Atlos' marker interpreter. */
const decodeAtlosPoint = (raw: AtlosPointTuple | AtlosPointObject, region: OEMRegion, fallbackSubregionId: string): OEMPoint | undefined => {
  if (!Array.isArray(raw) && raw && 'position' in (raw as object) && 'raw' in (raw as object)) return raw as unknown as OEMPoint;
  const value = Array.isArray(raw)
    ? { id: raw[0], z: raw[1], x: raw[2], y: raw[3], tier: raw[4], type: raw[5] }
    : raw;
  if (value?.id == null) return undefined;
  const x = value.x ?? value.pos?.[1];
  const z = value.z ?? value.pos?.[0];
  const y = value.y ?? value.pos?.[2] ?? 0;
  const tier = value.tier ?? 0;
  if (typeof x !== 'number' || typeof z !== 'number' || ![x, y, z, tier].every(Number.isFinite)) return undefined;
  const subregionId = value.subregId ?? fallbackSubregionId;
  const floorId = tier === 0 ? 'M' : `${tier < 0 ? 'B' : 'L'}${Math.abs(Math.trunc(tier))}`;
  const mapPosition: OEMMapPosition = { regionId: region.id, subregionId, x, z, floorId };
  const game = mapToGameXZPosition(mapPosition, region, subregionId);
  const scale = 2 ** region.maxNativeZoom;
  return {
    id: String(value.id), regionId: region.id, subregionId, type: value.type ?? '', tier,
    raw: { x: game.x, y, z: game.z },
    position: { regionId: mapPosition.regionId, subregionId, floorId, x: x * scale, z: z * scale },
  };
};

/** Leaflet-backed implementation of the public OEM interface. */
export class OEM implements OEMContract {
  destroyed = false;
  private map!: L.Map;
  private lifetime = new AbortController();
  private resourceStates: OEMResourceStates = {
    points: { requested: false, status: 'idle' },
    labels: { requested: false, status: 'idle' },
    boundaries: { requested: false, status: 'idle' },
  };
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
  private pointMarkers = new Map<string, { marker: ViewportMarker; inner: HTMLElement; point: OEMPoint; group?: string }>();
  private pointClusters = new Map<string, CanvasClusterGroup>();
  private labelsLayer = L.layerGroup();
  private boundariesLayer = L.layerGroup();
  private points: OEMPoint[] = [];
  private customPoints = new Map<string, OEMCustomPoint>();
  private customInteractionEnabled = false;
  private customMarkers = new Map<string, { marker: ViewportMarker; point: OEMCustomPoint; inner: HTMLElement }>();
  private markerShells = new Map<string, HTMLElement>();
  private markerVisualTemplates = new WeakMap<OEMPointType, Map<boolean, HTMLElement>>();
  private updates: Promise<unknown> = Promise.resolve();
  private coordinating = 0;
  private emittedState?: OEMMapState;
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
  private attributionBrand!: HTMLAnchorElement;
  private attributionLink!: HTMLAnchorElement;
  private observer?: ResizeObserver;
  private updatingView = false;
  private emittedView?: OEMView;
  private overdragFrame?: number;
  private overdragged = false;
  private wheel!: ReturnType<typeof enableSmoothWheelZoom>;

  constructor(private container: HTMLElement, readonly manifest: OEMManifest, private options: OEMOptions) {
    options.signal?.throwIfAborted();
    if (mounted.has(container)) throw new Error('This container already hosts an OEM instance');
    this.region = getOEMRegion(manifest, options.view?.regionId ?? options.regionId ?? manifest.defaultRegionId);
    this.filter = cloneFilter(options.pointFilter ?? {});
    this.boundarySource = options.features?.boundarySource ?? 'oem';
    this.customPoints = new Map(this.normalizeCustomPoints(options.customPoints ?? []).map(point => [point.id, point]));
    if (options.subregionId) this.filter.subregions = [options.subregionId];
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
    try {
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
      this.applyFloor(initialFloor);
      this.renderCustomPoints();
      this.map.on('click', this.emitMapClick);
      this.root.addEventListener('click', this.activatePoint, true);
      this.root.addEventListener('pointerover', this.hoverPoint);
      this.root.addEventListener('pointerout', this.hoverPoint);
      this.root.addEventListener('keydown', this.keyPoint, true);
      this.map.on('moveend zoomend', this.emitView);
      this.map.on('move drag', this.scheduleOverdragUpdate);
      this.map.on('moveend dragend movestart zoomstart', this.clearOverdrag);
      if (typeof ResizeObserver !== 'undefined') {
        this.observer = new ResizeObserver(() => { if (!this.destroyed) this.resize(); });
        this.observer.observe(container);
      }
      options.signal?.addEventListener('abort', this.destroy, { once: true });
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  /** Prevents calls against a released map instance. */
  private assertAlive(): void { if (this.destroyed) throw new OEMError('DESTROYED', 'map', 'OEM instance has been destroyed'); }
  private validateFloor(id: string): void {
    if (!this.region.floors.some((floor) => floor.id === id)) throw new Error(`Unknown floor ${id} in ${this.region.id}`);
  }
  private validatePosition(position: OEMPosition): void { toOEMLeafletPosition(position, this.region); }
  private normalizeCustomPoints(points: readonly OEMCustomPoint[]): OEMCustomPoint[] {
    if (!Array.isArray(points)) invalid('customPoints', 'Expected an array');
    const ids = new Set<string>();
    return points.map((point, index) => {
      const path = `customPoints[${index}]`;
      if (!point || typeof point.id !== 'string' || !point.id.trim()) {
        invalid(`${path}.id`, 'Custom point IDs must be non-empty and unique');
      }
      const id = point.id.trim();
      if (ids.has(id)) invalid(`${path}.id`, 'Custom point IDs must be non-empty and unique');
      ids.add(id);
      if (!point.position || typeof point.position.regionId !== 'string') {
        invalid(`${path}.position`, 'Invalid custom point position');
      }
      const position = point.position;
      if (point.style !== 'framed' && point.style !== 'no-frame') {
        invalid(`${path}.style`, 'Invalid custom point style');
      }
      if (typeof point.icon !== 'string' || !point.icon) {
        invalid(`${path}.icon`, 'Custom point icon must be a non-empty URL');
      }
      const pointRegion = this.manifest.regions.find(region => region.id === position.regionId);
      if (!pointRegion) invalid(`${path}.position.regionId`, 'Unknown custom point region');
      if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) invalid(`${path}.position`, 'Invalid OEM map position');
      if (position.subregionId && !pointRegion.subregions.some((subregion) => subregion.id === position.subregionId)) {
        invalid(`${path}.position.subregionId`, 'Unknown custom point subregion');
      }
      if (position.floorId && !pointRegion.floors.some((floor) => floor.id === position.floorId)) {
        invalid(`${path}.position.floorId`, 'Unknown custom point floor');
      }
      return { ...cloneCustomPoint({ ...point, position }), id };
    });
  }
  private position(latlng: L.LatLng): OEMPosition {
    return fromOEMLeafletPosition(latlng.lat, latlng.lng, this.region, this.floorId);
  }
  private loadBoundaryData(reference: OEMAsset): Promise<OEMBoundary[]> {
    const cached = this.boundaryData.get(reference.path);
    if (cached) return Promise.resolve(cached);
    const pending = this.boundaryDataRequests.get(reference.path);
    if (pending) return pending;
    const request = fetchOEMJson<unknown>(resolveOEMAsset(this.options.resources.baseUrl, reference.path), this.lifetime.signal).then((value) => {
      this.lifetime.signal.throwIfAborted();
      const boundaries = parseBoundaryCollection(value, reference.path);
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
    try { await this.loadBoundaryData(this.region.boundaries); } catch { this.lifetime.signal.throwIfAborted(); /* Click metadata has a bounds fallback. */ }
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
    if (scores.length) return undefined;

    const bounds = this.region.subregions
      .filter((subregion) => subregion.bounds && (!allowed || allowed.has(subregion.id)))
      .flatMap((subregion) => {
        const [[minX, minZ], [maxX, maxZ]] = subregion.bounds!;
        const insideX = point.x >= minX && point.x <= maxX;
        const insideZ = point.z >= minZ && point.z <= maxZ;
        if (!insideX || !insideZ) return [];
        const dx = Math.min(point.x - minX, maxX - point.x);
        const dz = Math.min(point.z - minZ, maxZ - point.z);
        return [{ id: subregion.id, distance: Math.min(dx, dz) ** 2 }];
      })
      .sort((left, right) => right.distance - left.distance || left.id.localeCompare(right.id));
    return bounds[0]?.id;
  }
  private capturePosition(x: number, z: number): OEMMapClick {
    const subregionId = this.inferSubregionId(x, z);
    const precise = this.region.boundaries && this.boundaryData.get(this.region.boundaries.path)?.length;
    const snapshot = createOEMCoordinateSnapshot({ regionId: this.region.id, x, z, floorId: this.floorId,
      ...(subregionId ? { subregionId } : {}) }, this.manifest, subregionId ? precise ? 'geometry' : 'bounds' : 'unresolved');
    return Object.freeze({ ...snapshot, position: snapshot.mapPosition, game: snapshot.gamePosition });
  }
  private emitMapClick = (event: L.LeafletMouseEvent): void => {
    if (!this.destroyed && this.listeners.get('click')?.size) this.emit('click', this.capturePosition(event.latlng.lng, event.latlng.lat));
  };
  private pointElement(target: EventTarget | null): HTMLElement | null {
    return target instanceof Element ? target.closest<HTMLElement>('[data-oem-point]') : null;
  }
  private pointInteraction(element: HTMLElement, trigger: 'pointer' | 'keyboard'): OEMPointInteraction | undefined {
    const key = element.dataset.oemPoint!;
    const separator = key.indexOf(':');
    const source = key.slice(0, separator), id = key.slice(separator + 1);
    if (source === 'custom') {
      const point = this.getCustomPoint(id);
      return point ? { source, point, trigger, coordinates: createOEMCoordinateSnapshot(point.position, this.manifest) } : undefined;
    }
    const point = this.getPoint(id);
    return point ? { source: 'published', point, trigger,
      coordinates: createOEMCoordinateSnapshot(toOEMMapPosition({ ...point.position, subregionId: point.subregionId }, this.region), this.manifest) } : undefined;
  }
  private activatePoint = (event: MouseEvent): void => {
    const element = this.pointElement(event.target);
    if (!element || this.destroyed) return;
    // Stop the map click independently of whether the host cancels navigation.
    event.stopPropagation();
    if (!this.listeners.get('pointclick')?.size) return;
    const point = this.pointInteraction(element, event.detail === 0 ? 'keyboard' : 'pointer');
    if (point) this.emit('pointclick', { ...point,
      get defaultPrevented() { return event.defaultPrevented; },
      preventDefault: () => event.preventDefault(),
    });
  };
  private hoverPoint = (event: PointerEvent): void => {
    const element = this.pointElement(event.target);
    if (!element || element === this.pointElement(event.relatedTarget) || this.destroyed) return;
    const name = event.type === 'pointerover' ? 'pointenter' : 'pointleave';
    if (!this.listeners.get(name)?.size) return;
    const point = this.pointInteraction(element, 'pointer');
    if (point) this.emit(name, point);
  };
  private keyPoint = (event: KeyboardEvent): void => {
    const element = this.pointElement(event.target);
    if (!element || (event.key !== ' ' && (event.key !== 'Enter' || element instanceof HTMLAnchorElement))) return;
    event.preventDefault(); event.stopPropagation(); element.click();
  };
  private emit<Event extends keyof OEMEvents>(event: Event, payload: OEMEvents[Event]): void {
    if (this.destroyed && event !== 'destroy') return;
    const deliver = (handler: (payload: never) => void) => {
      try { handler(payload as never); } catch (cause) {
        const error = new OEMError('CALLBACK_FAILED', event, 'OEM event handler failed', undefined, { cause });
        if (event !== 'error') this.emit('error', error);
        else console.error(error);
      }
    };
    this.listeners.get(event)?.forEach(deliver);
    if (event === 'error' && this.options.onError) deliver(this.options.onError as (payload: never) => void);
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
    this.emitState();
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
    if (event === 'click' || event === 'pointclick' || event === 'pointenter' || event === 'pointleave') this.enableCustomInteraction();
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
    layer.on('tileerror', () => { if (this.region.id === regionId && this.floorId === floorId) this.emit('error', resourceError('tiles', new Error(`Tile load failed: ${regionId}/${floorId}`))); });
    return layer;
  }
  private clampZoom(zoom: number): number {
    if (!Number.isFinite(zoom)) throw new Error('Zoom must be finite');
    return Math.max(this.region.minZoom, Math.min(this.region.maxZoom, zoom));
  }
  /** Returns the current view in the OEM pixel coordinate system. */
  getView(): OEMView { this.assertAlive(); return { ...this.position(this.map.getCenter()), zoom: this.map.getZoom() }; }

  /** Sets the view without exposing Leaflet's coordinate objects. */
  private applyView(view: OEMView): void {
    this.assertAlive();
    this.validatePosition(view);
    const zoom = this.clampZoom(view.zoom);
    if (view.floorId) this.applyFloor(view.floorId);
    this.map.setView(toOEMLeafletPosition(view, this.region), zoom, { animate: false });
  }
  /** Changes zoom around the current center with an optional native transition. */
  private applyZoom(zoom: number, options: OEMZoomOptions = {}): void {
    this.assertAlive();
    this.map.setZoom(this.clampZoom(zoom), { animate: options.animate ?? false });
  }
  /** Fits the map to an OEM pixel-coordinate extent. */
  private applyBounds(bounds: [OEMPosition, OEMPosition]): void {
    this.assertAlive();
    this.map.fitBounds(L.latLngBounds(toOEMLeafletPosition(bounds[0], this.region), toOEMLeafletPosition(bounds[1], this.region)), { animate: false });
  }
  /** Switches regions and reloads only the features currently enabled. */
  private applyRegionSelection(regionId: string): void {
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
    void this.prepareSubregionBoundaries().catch(() => undefined);

  }
  /** Switches the rendered floor while retaining the current region view. */
  private applyFloor(floorId: string): void {
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
  private applyLocale(locale: string): void {
    this.assertAlive();
    const resolved = normalizeOEMLocale(locale, Object.keys(this.manifest.locales), this.manifest.fallbackLocale);
    const changed = resolved !== this.resolvedLocale;
    this.locale = locale;
    if (!changed) return;
    this.resolvedLocale = resolved;
    this.updateAttribution();

  }
  /** Returns both the requested and resolved locale values. */
  getLocale(): { requested: string; resolved: string } { this.assertAlive(); return { requested: this.locale, resolved: this.resolvedLocale }; }

  /** Changes only this instance's theme attribute. */
  private applyTheme(theme: 'light' | 'dark'): void { this.assertAlive(); this.root.dataset.theme = theme; }

  private setResourceStatus(feature: OEMFeatureName, status: OEMResourceState['status'], error?: Error): void {
    if (this.destroyed) return;
    this.resourceStates[feature] = { requested: !!this.features[feature], status, ...(error ? { error } : {}) };
    this.emit('resourcechange', { feature, state: this.getResourceState()[feature] });
  }

  getResourceState(): OEMResourceStates {
    this.assertAlive();
    return Object.fromEntries(FEATURE_NAMES.map(feature => {
      const state = this.resourceStates[feature];
      const error = state.error;
      return [feature, { ...state, ...(error ? { error: error instanceof OEMError
        ? new OEMError(error.code, error.operation, error.message)
        : new Error(error.message) } : {}) }];
    })) as OEMResourceStates;
  }

  /** Retry failed, still-requested optional layers without toggling their configuration. */
  private async applyRetry(feature?: OEMFeatureName): Promise<void> {
    this.assertAlive();
    if (feature !== undefined && !FEATURE_NAMES.includes(feature)) invalid('retry.feature', 'Unknown feature');
    await Promise.allSettled(FEATURE_NAMES.filter(name => (!feature || name === feature) &&
      this.features[name] && this.resourceStates[name].status === 'error').map(name => this.loadFeature(name)));
    this.lifetime.signal.throwIfAborted();
  }

  private clearFeature(feature: OEMFeatureName): void {
    if (feature === 'points') { this.points = []; this.clearPointLayers(); }
    else if (feature === 'labels') { this.labels = []; this.visibleLabelType = undefined; this.labelsLayer.clearLayers(); }
    else this.boundariesLayer.clearLayers();
  }

  /** Optional layer failures are reported separately from their requested visibility. */
  private async applyFeatures(features: OEMFeatures, reload: readonly OEMFeatureName[] = [], retryFailed: readonly OEMFeatureName[] = FEATURE_NAMES): Promise<void> {
    this.assertAlive();
    if (!features || typeof features !== 'object' || Array.isArray(features)) invalid('features', 'Expected an object');
    for (const feature of FEATURE_NAMES) if (features[feature] !== undefined && typeof features[feature] !== 'boolean') invalid(`features.${feature}`, 'Expected boolean');
    if (features.boundarySource !== undefined && features.boundarySource !== 'oem' && features.boundarySource !== 'game') invalid('features.boundarySource', 'Unknown OEM boundary source');
    const boundaryChanged = features.boundarySource !== undefined && features.boundarySource !== this.boundarySource;
    if (features.boundarySource !== undefined) this.boundarySource = features.boundarySource;
    const loads: Promise<void>[] = [];
    for (const feature of FEATURE_NAMES) {
      const previous = this.features[feature];
      const requested = features[feature] ?? previous ?? false;
      this.features[feature] = requested;
      if (requested && (requested !== previous || reload.includes(feature) || (feature === 'boundaries' && boundaryChanged) || (retryFailed.includes(feature) && this.resourceStates[feature].status === 'error'))) {
        loads.push(this.loadFeature(feature));
      } else if (!requested && (previous || this.resourceStates[feature].status !== 'idle')) {
        this.cancelRequest(feature);
        this.clearFeature(feature);
        this.setResourceStatus(feature, 'idle');
      }
    }
    await Promise.allSettled(loads);
    this.lifetime.signal.throwIfAborted();
  }

  private async readCustomPoints(url: string, signal: AbortSignal): Promise<OEMCustomPoint[]> {
    if (typeof url !== 'string' || !url.trim()) invalid('customPointsUrl', 'Expected a URL');
    let resolved: string;
    try { resolved = new URL(url, document.baseURI).href; } catch { return invalid('customPointsUrl', 'Invalid URL'); }
    const value = await fetchOEMJson<unknown>(resolved, signal);
    if (!Array.isArray(value)) invalid('customPointsUrl', 'Expected a points array');
    return this.normalizeCustomPoints(value.map(point => ({ ...point,
      icon: typeof point?.icon === 'string' ? new URL(point.icon, resolved).href : point?.icon,
    })));
  }
  private replaceCustomPoints(points: readonly OEMCustomPoint[]): void {
    const previous = this.customPoints;
    this.customPoints = new Map(points.map(point => [point.id, point]));
    this.renderCustomPoints();
    if (this.listeners.get('custompointschange')?.size) this.emit('custompointschange', {
      added: points.filter(point => !previous.has(point.id)).map(point => point.id),
      updated: points.filter(point => previous.has(point.id)).map(point => point.id),
      removed: [...previous.keys()].filter(id => !this.customPoints.has(id)),
    });
  }
  getCustomPoints(): OEMCustomPoint[] { this.assertAlive(); return [...this.customPoints.values()].map(cloneCustomPoint); }
  getCustomPoint(id: string): OEMCustomPoint | undefined {
    this.assertAlive();
    if (typeof id !== 'string' || !id.trim()) invalid('pointId', 'Expected an ID');
    const point = this.customPoints.get(id.trim()); return point ? cloneCustomPoint(point) : undefined;
  }
  async setCustomPoints(points: readonly OEMCustomPoint[], options?: OEMCommandOptions): Promise<void> {
    this.assertAlive(); const snapshot = this.normalizeCustomPoints(points);
    return this.enqueue(() => this.replaceCustomPoints(snapshot), options?.signal);
  }
  async upsertCustomPoints(points: readonly OEMCustomPoint[], options?: OEMCommandOptions): Promise<void> {
    this.assertAlive(); const snapshot = this.normalizeCustomPoints(points);
    return this.enqueue(() => {
      const added: string[] = [], updated: string[] = [];
      for (const point of snapshot) {
        (this.customPoints.has(point.id) ? updated : added).push(point.id);
        this.customPoints.set(point.id, point); this.syncCustomPoint(point.id);
      }
      if (snapshot.length) this.emit('custompointschange', { added, updated, removed: [] });
    }, options?.signal);
  }
  async removeCustomPoints(ids: readonly string[], options?: OEMCommandOptions): Promise<void> {
    this.assertAlive();
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id.trim())) invalid('pointIds', 'Expected IDs');
    const snapshot = [...new Set(ids.map(id => id.trim()))];
    return this.enqueue(() => {
      const removed = snapshot.filter(id => this.customPoints.delete(id));
      for (const id of removed) this.syncCustomPoint(id);
      if (removed.length) this.emit('custompointschange', { added: [], updated: [], removed });
    }, options?.signal);
  }
  loadCustomPoints(url: string, options?: OEMCommandOptions): Promise<void> {
    return this.enqueue(async signal => this.replaceCustomPoints(await this.readCustomPoints(url, signal)), options?.signal);
  }
  clearCustomPoints(): Promise<void> { return this.enqueue(() => this.replaceCustomPoints([])); }

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
    const paths = Object.hasOwn(pointIndex, id)
      ? [pointIndex[id]]
      : this.manifest.pointIndex
        ? []
        : this.manifest.regions.flatMap((region) => region.points.map((ref) => ref?.path));
    for (const path of paths) {
      const points = await this.loadPointShard(path);
      this.lifetime.signal.throwIfAborted();
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
        this.lifetime.signal,
      ).then((value) => {
        this.lifetime.signal.throwIfAborted();
        if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('pointIndex', 'Invalid OEM point index');
        const index = value as Record<string, string>;
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
    const request = fetchOEMJson<unknown>(resolveOEMAsset(this.options.resources.baseUrl, path), this.lifetime.signal).then((value) => {
      this.lifetime.signal.throwIfAborted();
      const region = this.manifest.regions.find((entry) => entry.points.some((ref) => ref.path === path));
      if (!region || !Array.isArray(value)) invalid(path, 'Invalid OEM point shard');
      return this.decodePointShard(value, path, region);
    }).catch((error) => {
      if (this.pointShardRequests.get(path) === request) this.pointShardRequests.delete(path);
      throw error;
    });
    this.pointShardRequests.set(path, request);
    return request;
  }

  private decodePointShard(value: unknown[], shardPath: string, region: OEMRegion = this.region): OEMPoint[] {
    const fallbackSubregionId = shardPath.split('/').at(-1)?.replace(/\.json$/, '') ?? '';
    return value
      .map(entry => decodeAtlosPoint(entry as AtlosPointTuple | AtlosPointObject, region, fallbackSubregionId))
      .filter((entry): entry is OEMPoint => !!entry);
  }

  private cancelRequest(feature: OEMFeatureName): void {
    if (!this.requests.has(feature)) return;
    this.requests.get(feature)!.abort();
    this.requests.delete(feature);
    this.setResourceStatus(feature, 'idle');
    this.emit('loading', { feature, loading: false });
  }
  private cancelRequests(): void { for (const feature of this.requests.keys()) this.cancelRequest(feature); }
  /** Loads one feature with a request token so stale responses are ignored. */
  private async loadFeature(feature: OEMFeatureName): Promise<void> {
    this.cancelRequest(feature);
    const request = new AbortController();
    this.requests.set(feature, request);
    const region = this.region;
    this.setResourceStatus(feature, 'loading');
    this.emit('loading', { feature, loading: true });
    const read = <Data>(ref: OEMAsset) => fetchOEMJson<Data>(resolveOEMAsset(this.options.resources.baseUrl, ref?.path), request.signal);
    try {
      if (feature === 'points') {
        const [groups, types] = await Promise.all([
          Promise.all(region.points.map(async (ref) => {
            const value = await read<unknown[]>(ref);
            if (!Array.isArray(value)) invalid(ref.path, 'Invalid OEM point shard');
            return this.decodePointShard(value, ref.path, region);
          })),
          Object.keys(this.types).length ? this.types : read<Record<string, OEMPointType>>(this.manifest.types),
        ]);
        if (request.signal.aborted) return;
        const points = groups.flat();
        this.points = points;
        this.types = types;
        this.renderPoints();
      } else if (feature === 'labels') {
        const [labels, messages] = await Promise.all([
          region.labels ? read<OEMLabel[]>(region.labels) : Promise.resolve([]),
          this.manifest.locales[this.resolvedLocale] ? read<OEMLocaleMessages>(this.manifest.locales[this.resolvedLocale]) : Promise.resolve({}),
        ]);
        if (request.signal.aborted) return;
        this.labels = labels;
        this.messages = messages;
        this.renderLabels(true);
      } else {
        const reference = this.boundarySource === 'game' ? this.region.gameBoundaries : this.region.boundaries;
        const boundaries = reference ? await withOEMAbort(this.loadBoundaryData(reference), request.signal) : [];
        if (request.signal.aborted) return;
        this.renderBoundaries(boundaries);
      }
      if (!request.signal.aborted) this.setResourceStatus(feature, 'ready');
    } catch (error) {
      if (!request.signal.aborted) {
        const failure = resourceError(`load.${feature}`, error);
        this.clearFeature(feature);
        this.setResourceStatus(feature, 'error', failure);
        this.emit('error', failure);
        throw failure;
      }
    } finally {
      if (this.requests.get(feature) === request) {
        this.requests.delete(feature);
        this.emit('loading', { feature, loading: false });
      }
    }
  }
  /** Applies a client-side filter without making another network request. */
  private applyPointFilter(filter: OEMPointFilter): void {
    this.assertAlive();
    if (!filter || typeof filter !== 'object') invalid('pointFilter', 'Expected an object');
    for (const key of ['types', 'subregions'] as const) if (filter[key] !== undefined && (!Array.isArray(filter[key]) || filter[key]!.some(value => typeof value !== 'string' || !value.trim()))) invalid(`pointFilter.${key}`, 'Expected non-empty strings');
    if (filter.floorOnly !== undefined && typeof filter.floorOnly !== 'boolean') invalid('pointFilter.floorOnly', 'Expected boolean');
    const next = cloneFilter(filter);
    if (sameFilter(this.filter, next)) return;
    this.filter = next;
    this.renderPoints();
  }

  /** Enables or disables Atlos-style marker clustering without reloading point data. */
  private applyMarkerClustering(enabled: boolean): void {
    this.assertAlive();
    if (enabled === this.markerClustering) return;
    this.markerClustering = enabled;
    this.renderPoints();
  }

  private clearPointLayers(): void {
    this.pointsLayer.clearLayers();
    this.pointMarkers.clear();
    for (const group of this.pointClusters.values()) {
      group.clearLayers();
      group.remove();
    }
    this.pointClusters.clear();
  }

  private createCustomPointVisual(point: OEMCustomPoint): HTMLElement {
    const inner = this.createMarkerShell(point.style === 'no-frame', false);
    inner.setAttribute('aria-label', point.id);
    if (this.customInteractionEnabled) {
      inner.setAttribute('data-oem-point', `custom:${point.id}`); inner.tabIndex = 0; inner.setAttribute('role', 'button');
    }
    if (point.position.floorId && point.position.floorId !== this.floorId) inner.classList.add('offLayer');
    const image = inner.querySelector('img')!;
    image.src = point.icon;
    image.alt = point.id;
    return inner;
  }

  private createMarkerShell(noFrame: boolean, link: boolean): HTMLElement {
    const key = `${+noFrame}${+link}`;
    let template = this.markerShells.get(key);
    if (!template) {
      template = document.createElement(link ? 'a' : 'div');
      template.className = noFrame ? 'noFrameInner' : 'markerInner';
      const image = document.createElement('img'); image.draggable = false;
      if (noFrame) { image.className = 'noFrameImage'; template.append(image); }
      else { const frame = document.createElement('div'); frame.className = 'frameImage'; frame.append(image); template.append(frame); }
      this.markerShells.set(key, template);
    }
    return template.cloneNode(true) as HTMLElement;
  }

  /** Delegated interaction is enabled only when used, without per-marker listeners. */
  private enableCustomInteraction(): void {
    if (this.customInteractionEnabled) return;
    this.customInteractionEnabled = true;
    for (const [id, { marker, inner }] of this.customMarkers) {
      marker.getElement()?.classList.add('leaflet-interactive');
      inner.setAttribute('data-oem-point', `custom:${id}`); inner.tabIndex = 0; inner.setAttribute('role', 'button');
    }
  }
  private syncCustomPoint(id: string): void {
    const point = this.customPoints.get(id), existing = this.customMarkers.get(id);
    if (!point || point.position.regionId !== this.region.id) {
      if (existing) { this.customPointsLayer.removeLayer(existing.marker); this.customMarkers.delete(id); }
      return;
    }
    if (existing) {
      if (existing.point.icon !== point.icon || existing.point.style !== point.style) {
        this.customPointsLayer.removeLayer(existing.marker); this.customMarkers.delete(id);
      } else {
        if (existing.point.position.x !== point.position.x || existing.point.position.z !== point.position.z) existing.marker.setLatLng(toOEMLeafletMapPosition(point.position));
        existing.inner.classList.toggle('offLayer', !!point.position.floorId && point.position.floorId !== this.floorId);
        existing.point = point;
        return;
      }
    }
    const inner = this.createCustomPointVisual(point);
    const marker = new ViewportMarker(toOEMLeafletMapPosition(point.position), {
      interactive: false, keyboard: false, bubblingMouseEvents: false,
      icon: L.divIcon({ html: inner,
        className: `${point.style === 'no-frame' ? 'noFrameMarkerIcon' : 'frameMarkerIcon'} incompleteMarker${this.customInteractionEnabled ? ' leaflet-interactive' : ''}`,
        iconSize: point.style === 'no-frame' ? [50, 50] : [32, 32], iconAnchor: point.style === 'no-frame' ? [25, 25] : [16, 32] }),
    });
    marker.addTo(this.customPointsLayer); this.customMarkers.set(id, { marker, point, inner });
  }
  private renderCustomPoints(): void {
    for (const id of this.customMarkers.keys()) if (!this.customPoints.has(id)) this.syncCustomPoint(id);
    for (const id of this.customPoints.keys()) this.syncCustomPoint(id);
  }

  /** Builds the shared Atlos marker composition for points and cluster summaries. */
  private createMarkerVisual(type: OEMPointType, point?: OEMPoint, count?: number): HTMLElement {
    let templates = this.markerVisualTemplates.get(type);
    if (!templates) this.markerVisualTemplates.set(type, templates = new Map<boolean, HTMLElement>());
    let template = templates.get(!!point);
    if (!template) {
      template = this.createMarkerShell(!!type.noFrame, !!point);
      const image = template.querySelector('img')!;
      image.src = resolveOEMAsset(this.options.resources.baseUrl, type.icon); image.alt = type.key;
      if (type.subIcon) {
        const sub = document.createElement('div'); sub.className = 'subIconContainer';
        const subImage = document.createElement('img'); subImage.className = 'subIcon';
        subImage.src = resolveOEMAsset(this.options.resources.baseUrl, type.subIcon); subImage.alt = '';
        sub.append(subImage); template.append(sub);
      }
      templates.set(!!point, template);
    }
    const inner = template.cloneNode(true) as HTMLElement;
    if (point) {
      const link = inner as HTMLAnchorElement;
      link.href = createOEMPointUrl(point.id);
      inner.setAttribute('data-oem-point', `published:${point.id}`);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      inner.classList.toggle('offLayer', point.position.floorId !== this.floorId);
      if (point.tier) inner.dataset.tier = point.position.floorId;
    }
    if (count !== undefined) inner.classList.add('clusterMarker');
    if (count !== undefined) {
      const badge = document.createElement('span');
      badge.className = 'clusterCount';
      badge.textContent = String(count);
      inner.append(badge);
    }
    return inner;
  }

  private createPointMarker(point: OEMPoint, type: OEMPointType): ViewportMarker {
    return new ViewportMarker(toOEMLeafletPosition(point.position, this.region), {
      interactive: true, keyboard: false, bubblingMouseEvents: false,
      icon: L.divIcon({ html: this.createMarkerVisual(type, point),
        className: `${type.noFrame ? 'noFrameMarkerIcon' : 'frameMarkerIcon'} incompleteMarker`,
        iconSize: type.noFrame ? [50, 50] : [32, 32], iconAnchor: type.noFrame ? [25, 25] : [16, 32] }),
    });
  }

  private createPointCluster(type: OEMPointType): CanvasClusterGroup {
    return createCanvasAwareClusterGroup(this.map, {
      expandOnClick: !this.options.lockZoom,
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

  /** Keep stable markers and batch only changes in cluster membership. */
  private renderPoints(): void {
    const types = this.filter.types ? new Set(this.filter.types) : undefined;
    const subregions = this.filter.subregions ? new Set(this.filter.subregions) : undefined;
    const desired = new Set<string>();
    const remove = new Map<string, ViewportMarker[]>();
    const add = new Map<string, ViewportMarker[]>();
    const addPlain: ViewportMarker[] = [];
    const detach = (entry: { marker: ViewportMarker; group?: string }) => {
      if (entry.group) { const batch = remove.get(entry.group) ?? []; batch.push(entry.marker); remove.set(entry.group, batch); }
      else this.pointsLayer.removeLayer(entry.marker);
    };
    for (const point of this.points) {
      if (types && !types.has(point.type)) continue;
      if (subregions && !subregions.has(point.subregionId)) continue;
      if (this.filter.floorOnly && point.position.floorId !== this.floorId) continue;
      const type = Object.hasOwn(this.types, point.type) ? this.types[point.type] : undefined;
      if (!type) continue;
      desired.add(point.id);
      const group = this.markerClustering && CLUSTER_SUBCATEGORIES.has(type.category.sub) ? type.key : undefined;
      let entry = this.pointMarkers.get(point.id);
      const fresh = !entry || entry.point !== point;
      const previousGroup = entry?.group;
      if (entry && (fresh || previousGroup !== group)) detach(entry);
      if (fresh) {
        const marker = this.createPointMarker(point, type);
        const inner = (marker.options.icon as L.DivIcon).options.html as HTMLElement;
        entry = { marker, inner, point, group };
        this.pointMarkers.set(point.id, entry);
      }
      entry!.inner.classList.toggle('offLayer', point.position.floorId !== this.floorId);
      if (fresh || previousGroup !== group) {
        entry!.group = group;
        if (group) {
          if (!this.pointClusters.has(group)) this.pointClusters.set(group, this.createPointCluster(type));
          const batch = add.get(group) ?? []; batch.push(entry!.marker); add.set(group, batch);
        } else addPlain.push(entry!.marker);
      }
    }
    for (const [id, entry] of this.pointMarkers) if (!desired.has(id)) { detach(entry); this.pointMarkers.delete(id); }
    for (const [key, markers] of remove) this.pointClusters.get(key)?.removeLayers(markers);
    // Detach old cluster membership before adding markers to their new group.
    for (const marker of addPlain) marker.addTo(this.pointsLayer);
    for (const [key, markers] of add) this.pointClusters.get(key)!.addLayers(markers);
    for (const [key, group] of this.pointClusters) {
      if (group.getLayers().length) { if (!this.map.hasLayer(group)) group.addTo(this.map); }
      else { group.remove(); this.pointClusters.delete(key); }
    }
  }

  /** Renders Atlos-style fill and dashed stroke layers for published subregions. */
  private renderBoundaries(boundaries: OEMBoundary[]): void {
    this.boundariesLayer.clearLayers();
    for (const boundary of boundaries) {
      const rings = boundary.rings.map((ring) => ring.map((position) =>
        toOEMLeafletPosition({ ...position, regionId: this.region.id }, this.region)));
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
  /** Every asynchronous command and Widget patch shares this queue. */
  private enqueue<T>(operation: (signal: AbortSignal) => T | Promise<T>, externalSignal?: AbortSignal): Promise<T> {
    const signal = externalSignal ? AbortSignal.any([this.lifetime.signal, externalSignal]) : this.lifetime.signal;
    const result = this.updates.then(async () => {
      signal.throwIfAborted(); this.assertAlive(); this.coordinating++;
      try { return await operation(signal); }
      finally { this.coordinating--; if (!this.destroyed) this.emitState(); }
    });
    this.updates = result.catch(() => undefined);
    return withOEMAbort(result, signal);
  }
  getState(): OEMMapState {
    const view = this.getView();
    return { regionId: view.regionId, subregionId: this.filter.subregions?.length === 1 && this.region.subregions.some(subregion => subregion.id === this.filter.subregions![0]) ? this.filter.subregions[0] : null,
      floorId: this.floorId, locale: this.resolvedLocale,
      markerTypes: this.features.points ? this.filter.types ? [...this.filter.types] : '*' : [],
      labels: !!this.features.labels, boundaries: !!this.features.boundaries, boundarySource: this.boundarySource,
      markerClustering: this.markerClustering, zoom: view.zoom, center: { x: view.x, z: view.z },
      theme: this.root.dataset.theme as 'light' | 'dark', lockDrag: !!this.options.lockDrag, lockZoom: !!this.options.lockZoom };
  }
  private emitState(): void {
    if (this.destroyed || this.coordinating) return;
    const state = this.getState();
    if (this.emittedState && sameState(state, this.emittedState)) return;
    this.emittedState = state;
    this.emit('statechange', this.getState());
  }
  async update(update: OEMMapConfig): Promise<void> {
    validateConfig(update); const snapshot = cloneConfig(update);
    return this.enqueue(async signal => {
      const previous = this.getState();
      const changes = Object.fromEntries(Object.entries(snapshot).filter(([, value]) => value !== undefined)) as OEMMapConfig;
      if (changes.subregion !== undefined) changes.subregion = changes.subregion?.trim() || null;
      if (changes.subregion && changes.region === undefined) {
        const owner = this.manifest.regions.find(region => region.subregions.some(sub => sub.id === changes.subregion));
        if (!owner) invalid('options.subregion', 'Unknown subregion');
        changes.region = owner.id;
      }
      const merged = { ...toConfig(previous), ...changes };
      const regionId = resolveRegionId(this.manifest, changes.region ?? previous.regionId);
      if (regionId !== previous.regionId) {
        const preset = getPreset(getOEMRegion(this.manifest, regionId));
        if (changes.floor === undefined) merged.floor = 'M';
        if (changes.subregion === undefined) merged.subregion = null;
        if (changes.center === undefined) merged.center = preset.center;
        if (changes.zoom === undefined) merged.zoom = preset.zoom;
      }
      if (changes.subregion !== undefined && changes.subregion !== previous.subregionId) {
        const region = getOEMRegion(this.manifest, regionId);
        const preset = getPreset(region, region.subregions.find(sub => sub.id === changes.subregion));
        if (changes.center === undefined) merged.center = preset.center;
        if (changes.zoom === undefined) merged.zoom = preset.zoom;
      }
      const next = normalizeState(merged, this.manifest);
      const points = changes.customPointsUrl !== undefined ? await this.readCustomPoints(changes.customPointsUrl, signal)
        : changes.customPoints !== undefined ? this.normalizeCustomPoints(changes.customPoints) : undefined;
      signal.throwIfAborted();
      const regionChanged = next.regionId !== previous.regionId, localeChanged = next.locale !== previous.locale;
      if (regionChanged) this.applyRegionSelection(next.regionId);
      if (changes.locale !== undefined || localeChanged) this.applyLocale(changes.locale ?? next.locale);
      if (regionChanged || changes.markerTypes !== undefined || changes.subregion !== undefined) this.applyPointFilter({
        ...this.filter, types: changes.markerTypes === undefined ? this.filter.types : next.markerTypes === '*' ? undefined : next.markerTypes,
        subregions: changes.subregion === undefined && !regionChanged ? this.filter.subregions : next.subregionId ? [next.subregionId] : undefined,
      });
      this.applyFloor(next.floorId);
      this.applyMarkerClustering(next.markerClustering);
      if (next.theme !== previous.theme) this.applyTheme(next.theme);
      this.applyLocks(next);
      if (regionChanged || next.zoom !== previous.zoom || next.center.x !== previous.center.x || next.center.z !== previous.center.z) this.applyView({
        regionId: next.regionId, floorId: next.floorId, x: next.center.x, z: next.center.z, zoom: next.zoom,
      });
      if (points) this.replaceCustomPoints(points);
      await this.applyFeatures({ points: changes.markerTypes !== undefined ? hasMarkers(next) : !!this.features.points, labels: next.labels, boundaries: next.boundaries, boundarySource: next.boundarySource },
        regionChanged ? FEATURE_NAMES : localeChanged ? ['labels'] : [],
        FEATURE_NAMES.filter(feature => feature === 'points' ? changes.markerTypes !== undefined : feature === 'labels' ? changes.labels !== undefined : changes.boundaries !== undefined || changes.boundarySource !== undefined));
    });
  }
  private applyLocks(locks: OEMInteractionLocks): void {
    for (const key of ['lockDrag', 'lockZoom'] as const) if (locks[key] !== undefined && typeof locks[key] !== 'boolean') invalid(key, 'Expected boolean');
    const lockDrag = locks.lockDrag ?? !!this.options.lockDrag, lockZoom = locks.lockZoom ?? !!this.options.lockZoom;
    if (lockDrag === !!this.options.lockDrag && lockZoom === !!this.options.lockZoom) return;
    this.options.lockDrag = lockDrag; this.options.lockZoom = lockZoom;
    this.map.dragging[lockDrag ? 'disable' : 'enable']();
    for (const handler of [this.map.touchZoom, this.map.boxZoom, this.map.keyboard]) handler[lockZoom ? 'disable' : 'enable']();
    this.wheel.dispose();
    this.wheel = enableSmoothWheelZoom(this.map, { enableInertia: true, panEnabled: !lockDrag, zoomEnabled: !lockZoom });
    for (const group of this.pointClusters.values()) {
      group.options.expandOnClick = !lockZoom;
    }
  }
  setRegion(region: string): Promise<void> { return this.update({ region }); }
  setSubregion(subregion: string | null): Promise<void> { return this.update({ subregion }); }
  setFloor(floor: string): Promise<void> { return this.update({ floor }); }
  setLocale(locale: string): Promise<void> { return this.update({ locale }); }
  setTheme(theme: 'light' | 'dark'): Promise<void> { return this.update({ theme }); }
  setInteractionLocks(locks: OEMInteractionLocks): Promise<void> { return this.update(locks); }
  setMarkerClustering(markerClustering: boolean): Promise<void> { return this.update({ markerClustering }); }
  getPointFilter(): OEMPointFilter { this.assertAlive(); return cloneFilter(this.filter); }
  async setPointFilter(filter: OEMPointFilter): Promise<void> {
    if (!filter || typeof filter !== 'object') invalid('pointFilter', 'Expected a filter');
    for (const key of ['types', 'subregions'] as const) if (filter[key] !== undefined && !Array.isArray(filter[key])) invalid(`pointFilter.${key}`, 'Expected an array');
    const snapshot = cloneFilter(filter); return this.enqueue(() => this.applyPointFilter(snapshot));
  }
  async setView(view: OEMView): Promise<void> { if (!view) invalid('view', 'Expected a view'); return this.update({ region: view.regionId, floor: view.floorId, center: { x: view.x, z: view.z }, zoom: view.zoom }); }
  setZoom(zoom: number, options: OEMZoomOptions = {}): Promise<void> { const snapshot = { ...options }; return this.enqueue(() => this.applyZoom(zoom, snapshot)); }
  async fitBounds(bounds: [OEMPosition, OEMPosition]): Promise<void> { if (!Array.isArray(bounds) || bounds.length !== 2 || bounds.some(point => !point)) invalid('bounds', 'Expected two pixel positions'); const snapshot = bounds.map(point => ({ ...point })) as [OEMPosition, OEMPosition]; return this.enqueue(() => this.applyBounds(snapshot)); }
  async setFeatures(features: OEMFeatures): Promise<void> { if (!features || typeof features !== 'object') invalid('features', 'Expected features'); const snapshot = { ...features }; return this.enqueue(() => this.applyFeatures(snapshot)); }
  retry(feature?: OEMFeatureName): Promise<void> { return this.enqueue(() => this.applyRetry(feature)); }
  project(position: OEMMapPosition): OEMScreenPosition {
    this.assertAlive();
    if (position.regionId !== this.region.id) invalid('position.regionId', 'Project in the current region');
    const point = this.map.latLngToContainerPoint(toOEMLeafletMapPosition(position));
    return { x: point.x, y: point.y };
  }
  unproject(position: OEMScreenPosition): OEMMapClick {
    this.assertAlive();
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) invalid('screenPosition', 'Expected finite CSS pixels');
    const point = this.map.containerPointToLatLng(L.point(position.x, position.y));
    return this.capturePosition(point.lng, point.lat);
  }

  /** Recalculates Leaflet dimensions after the host element changes size. */
  resize(): void { this.assertAlive(); this.map.invalidateSize({ animate: false }); }

  /** Releases listeners, observers, pending requests, layers and DOM nodes. */
  destroy = (): void => {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit('destroy', undefined);
    this.lifetime.abort(this.options.signal?.reason);
    this.cancelRequests();
    if (this.overdragFrame !== undefined) cancelAnimationFrame(this.overdragFrame);
    this.observer?.disconnect();
    this.wheel?.dispose();
    this.options.signal?.removeEventListener('abort', this.destroy);
    this.listeners.clear();
    this.map?.remove();
    this.clearPointLayers();
    this.labelsLayer.clearLayers();
    this.boundariesLayer.clearLayers();
    this.root.removeEventListener('click', this.activatePoint, true);
    this.root.removeEventListener('pointerover', this.hoverPoint);
    this.root.removeEventListener('pointerout', this.hoverPoint);
    this.root.removeEventListener('keydown', this.keyPoint, true);
    this.root.remove();
    this.points = [];
    this.customPoints.clear();
    this.customMarkers.clear();
    this.markerShells.clear(); this.markerVisualTemplates = new WeakMap();
    this.customPointsLayer.clearLayers();
    this.pointShardRequests.clear();
    this.pointIndex = undefined;
    this.pointIndexRequest = undefined;
    this.boundaryData.clear();
    this.boundaryDataRequests.clear();
    this.labels = [];
    this.types = {};
    this.messages = {};
    mounted.delete(this.container);
  };
}
