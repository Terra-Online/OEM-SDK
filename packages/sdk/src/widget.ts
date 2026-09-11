import {
  defaultOEMResources,
  invalid,
  OEMError,
  getOEMRegion,
  loadOEMManifest,
  normalizeOEMLocale,
  checkOEMManifestVersion,
} from '@opendfieldmap/core';
import type { OEMManifest, OEMRegion, OEMResources, OEMSubregion } from '@opendfieldmap/core';
import { createOEM } from '@opendfieldmap/map';
import type { OEM, OEMClickPointOptions, OEMCustomPoint, OEMMapClick, OEMFeatureName, OEMResourceStates } from '@opendfieldmap/map';
import { mountControls } from './components';
import type { Control } from './components/types';
import { installFonts } from './fonts';
import type {
  OEMFloorId,
  OEMLocale,
  OEMRegionId,
  OEMWidget,
  OEMWidgetConfig,
  OEMWidgetEvents,
  OEMWidgetOptions,
  OEMWidgetState,
} from './types';

const REGION_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  VL: 'Valley_4',
  WL: 'Wuling',
  DJ: 'Dijiang',
  ES: 'Weekraid_1',
});

const mounted = new WeakMap<HTMLElement, symbol>();

const cloneState = (state: OEMWidgetState): OEMWidgetState => ({
  ...state,
  markerTypes: state.markerTypes === '*' ? '*' : [...state.markerTypes],
  center: { ...state.center },
});

/** Validate the entire patch before cloning it or touching a live instance. */
const validateConfig = (config: OEMWidgetConfig): void => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) invalid('options', 'Expected an object');
  for (const key of ['region', 'floor', 'locale', 'customPointsUrl'] as const) {
    if (config[key] !== undefined && (typeof config[key] !== 'string' || !config[key]!.trim())) invalid(`options.${key}`, 'Expected a non-empty string');
  }
  if (config.subregion !== undefined && config.subregion !== null && typeof config.subregion !== 'string') invalid('options.subregion', 'Expected a string or null');
  for (const key of ['labels', 'boundaries', 'markerClustering'] as const) {
    if (config[key] !== undefined && typeof config[key] !== 'boolean') invalid(`options.${key}`, 'Expected boolean');
  }
  if (config.zoom !== undefined && !Number.isFinite(config.zoom)) invalid('options.zoom', 'Zoom must be finite');
  if (config.center !== undefined && (!config.center || !Number.isFinite(config.center.x) || !Number.isFinite(config.center.z))) invalid('options.center', 'Center coordinates must be finite');
  if (config.markerTypes !== undefined && config.markerTypes !== false && config.markerTypes !== '*' &&
    (!Array.isArray(config.markerTypes) || config.markerTypes.some(value => typeof value !== 'string'))) invalid('options.markerTypes', 'Expected type keys, * or false');
  if (config.customPoints !== undefined && !Array.isArray(config.customPoints)) invalid('options.customPoints', 'Expected an array');
  config.customPoints?.forEach((point, index) => { if (!point || typeof point !== 'object' || !point.position || typeof point.position !== 'object') invalid(`options.customPoints[${index}]`, 'Expected a point with a position'); });
  if (config.customPoints !== undefined && config.customPointsUrl !== undefined) invalid('options.customPoints', 'Pass either customPoints or customPointsUrl, not both');
};

const cloneConfig = (config: OEMWidgetConfig): OEMWidgetConfig => ({
  ...config,
  markerTypes: Array.isArray(config.markerTypes) ? [...config.markerTypes] : config.markerTypes,
  customPoints: config.customPoints?.map((point) => ({ ...point, position: { ...point.position } })),
  center: config.center ? { ...config.center } : config.center,
});

const resolveContainer = (container: string | HTMLElement): HTMLElement => {
  const element = typeof container === 'string' ? document.querySelector<HTMLElement>(container) : container;
  if (!element) throw new Error(`OEM Widget container not found: ${container}`);
  return element;
};

const resolveRegionId = (manifest: OEMManifest, value?: string): OEMRegionId => {
  const requested = value ? REGION_ALIASES[value.toUpperCase()] ?? value : manifest.defaultRegionId;
  return getOEMRegion(manifest, requested).id as OEMRegionId;
};

const normalizeMarkerTypes = (value: OEMWidgetConfig['markerTypes']): string[] | '*' => {
  if (value === '*') return '*';
  if (!value || !Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => entry.trim()).filter(Boolean))];
};

const normalizeBoundarySource = (value: OEMWidgetConfig['boundarySource']): OEMWidgetState['boundarySource'] => {
  if (value === undefined || value === 'oem') return 'oem';
  if (value === 'game') return 'game';
  throw new Error(`Unknown OEM boundary source: ${value}`);
};

const getPreset = (region: OEMRegion, subregion?: OEMSubregion) => {
  if (!subregion?.bounds) {
    return {
      center: { x: region.initialView.x, z: region.initialView.z },
      zoom: region.initialView.zoom,
    };
  }
  return {
    center: {
      x: (subregion.bounds[0][0] + subregion.bounds[1][0]) / 2,
      z: (subregion.bounds[0][1] + subregion.bounds[1][1]) / 2,
    },
    zoom: Math.max(region.minZoom, Math.min(region.maxZoom, 1)),
  };
};

const normalizeState = (input: OEMWidgetConfig, manifest: OEMManifest): OEMWidgetState => {
  validateConfig(input);
  let regionId = resolveRegionId(manifest, input.region);
  const subregionId = input.subregion?.trim() || null;
  if (subregionId) {
    const owner = manifest.regions.find((region) => region.subregions.some((subregion) => subregion.id === subregionId));
    if (!owner) throw new Error(`Unknown OEM subregion: ${subregionId}`);
    if (input.region && owner.id !== regionId) {
      throw new Error(`OEM subregion ${subregionId} does not belong to ${regionId}`);
    }
    regionId = owner.id as OEMRegionId;
  }

  const region = getOEMRegion(manifest, regionId);
  const subregion = subregionId
    ? region.subregions.find((entry) => entry.id === subregionId)
    : undefined;
  const floorId = (input.floor ?? 'M') as OEMFloorId;
  if (!region.floors.some((floor) => floor.id === floorId)) {
    throw new Error(`Unknown OEM floor ${floorId} in ${regionId}`);
  }

  const requestedCenter = input.center;
  if (requestedCenter && (!Number.isFinite(requestedCenter.x) || !Number.isFinite(requestedCenter.z))) {
    throw new Error('OEM Widget center coordinates must be finite');
  }
  const preset = getPreset(region, subregion);
  const requestedLocale = input.locale ?? (typeof navigator === 'undefined' ? manifest.fallbackLocale : navigator.language);

  return {
    regionId,
    subregionId,
    floorId,
    locale: normalizeOEMLocale(requestedLocale, Object.keys(manifest.locales), manifest.fallbackLocale) as OEMLocale,
    markerTypes: normalizeMarkerTypes(input.markerTypes),
    labels: input.labels ?? true,
    boundaries: input.boundaries ?? false,
    boundarySource: normalizeBoundarySource(input.boundarySource),
    markerClustering: input.markerClustering ?? true,
    zoom: Math.max(region.minZoom, Math.min(region.maxZoom, input.zoom ?? preset.zoom)),
    center: {
      x: requestedCenter?.x ?? preset.center.x,
      z: requestedCenter?.z ?? preset.center.z,
    },
  };
};

const toConfig = (state: OEMWidgetState): OEMWidgetConfig => ({
  region: state.regionId,
  subregion: state.subregionId,
  floor: state.floorId,
  locale: state.locale,
  markerTypes: state.markerTypes,
  labels: state.labels,
  boundaries: state.boundaries,
  boundarySource: state.boundarySource,
  markerClustering: state.markerClustering,
  zoom: state.zoom,
  center: { ...state.center },
});

const sameMarkers = (left: OEMWidgetState['markerTypes'], right: OEMWidgetState['markerTypes']): boolean =>
  left === right || (left !== '*' && right !== '*' && left.length === right.length &&
    left.every((marker, index) => marker === right[index]));

const sameState = (left: OEMWidgetState, right: OEMWidgetState): boolean =>
  left.regionId === right.regionId &&
  left.subregionId === right.subregionId &&
  left.floorId === right.floorId &&
  left.locale === right.locale &&
  sameMarkers(left.markerTypes, right.markerTypes) &&
  left.labels === right.labels &&
  left.boundaries === right.boundaries &&
  left.boundarySource === right.boundarySource &&
  left.markerClustering === right.markerClustering &&
  left.zoom === right.zoom &&
  left.center.x === right.center.x &&
  left.center.z === right.center.z;

const hasMarkers = (state: OEMWidgetState): boolean =>
  state.markerTypes === '*' || state.markerTypes.length > 0;

class Widget implements OEMWidget {
  destroyed = false;
  private applying = false;
  private updates = Promise.resolve();
  private customPointsUrl?: string;
  private controls: Control;
  private unsubscribeView: () => void;
  private unsubscribeClick: () => void;
  private unsubscribeResource: () => void;
  private listeners = new Map<keyof OEMWidgetEvents, Set<(payload: never) => void>>();

  constructor(
    private host: HTMLElement,
    private root: HTMLElement,
    private core: OEM,
    private manifest: OEMManifest,
    private options: OEMWidgetOptions,
    private state: OEMWidgetState,
    private releaseHost: () => void,
  ) {
    this.customPointsUrl = options.customPointsUrl;
    this.controls = mountControls(root, {
      regionSelector: options.showRegionSelector ?? true,
      floorSelector: options.showFloorSelector ?? true,
      scaleBar: options.showScaleBar ?? true,
      horizontalSelectors: options.horizontalSelectors ?? false,
    }, {
      manifest,
      zoomLocked: options.lockZoom ?? false,
      apply: (update) => {
        void this.setOptions(update).catch((error: unknown) => this.report(error));
      },
      zoomTo: (zoom, zoomOptions) => core.setZoom(zoom, zoomOptions),
    });
    this.controls.sync(state);
    this.unsubscribeView = core.on('viewchange', this.syncView);
    this.unsubscribeClick = core.on('click', this.forwardClick);
    this.unsubscribeResource = core.on('resourcechange', payload => { if (!this.destroyed) this.emit('resourcechange', payload); });
    options.signal?.addEventListener('abort', this.destroy, { once: true });
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('OEM Widget has been destroyed');
  }

  private report(error: unknown): void {
    try { this.options.onError?.(error instanceof Error ? error : new Error(String(error))); } catch (cause) { console.error(new OEMError('CALLBACK_FAILED', 'onError', 'OEM error handler failed', undefined, { cause })); }
  }

  private notify(): void {
    if (this.destroyed) return;
    try { this.options.onStateChange?.(cloneState(this.state)); } catch (cause) { this.report(new OEMError('CALLBACK_FAILED', 'onStateChange', 'OEM state handler failed', undefined, { cause })); }
  }

  private emit<Event extends keyof OEMWidgetEvents>(event: Event, payload: OEMWidgetEvents[Event]): void {
    this.listeners.get(event)?.forEach(handler => { try { handler(payload as never); } catch (cause) { this.report(new OEMError('CALLBACK_FAILED', event, 'OEM event handler failed', undefined, { cause })); } });
  }

  private forwardClick = (payload: OEMMapClick): void => {
    if (!this.destroyed) this.emit('click', payload);
  };

  private syncView = (): void => {
    if (this.destroyed || this.applying) return;
    const view = this.core.getView();
    this.state = {
      ...this.state,
      regionId: view.regionId as OEMRegionId,
      floorId: (view.floorId ?? 'M') as OEMFloorId,
      locale: this.core.getLocale().resolved as OEMLocale,
      center: { x: view.x, z: view.z },
      zoom: view.zoom,
    };
    this.controls.sync(this.state);
    this.notify();
  };

  getState(): OEMWidgetState {
    this.assertAlive();
    return cloneState(this.state);
  }

  getResourceState(): OEMResourceStates {
    this.assertAlive();
    return this.core.getResourceState();
  }

  retry(feature?: OEMFeatureName): Promise<void> {
    this.assertAlive();
    const operation = this.updates.then(async () => {
      this.assertAlive();
      await this.core.retry(feature);
      this.assertAlive();
    });
    this.updates = operation.catch(() => undefined);
    return operation;
  }

  setCustomPoints(points: readonly OEMCustomPoint[]): void {
    this.assertAlive();
    this.core.setCustomPoints(points);
    this.customPointsUrl = undefined;
  }

  setClickPointMode(options?: OEMClickPointOptions | null): void {
    this.assertAlive();
    this.core.setClickPointMode(options);
  }

  clearClickPoints(): void {
    this.assertAlive();
    this.core.clearClickPoints();
  }

  loadCustomPoints(url: string): Promise<void> {
    return this.setOptions({ customPointsUrl: url });
  }

  clearCustomPoints(): void {
    this.assertAlive();
    this.core.clearCustomPoints();
  }

  getPoint(pointId: string) {
    this.assertAlive();
    return this.core.getPoint(pointId);
  }

  loadPoint(pointId: string) {
    this.assertAlive();
    return this.core.loadPoint(pointId);
  }

  on<Event extends keyof OEMWidgetEvents>(event: Event, handler: (payload: OEMWidgetEvents[Event]) => void): () => void {
    this.assertAlive();
    const handlers = this.listeners.get(event) ?? new Set();
    handlers.add(handler as (payload: never) => void);
    this.listeners.set(event, handlers);
    return () => { handlers.delete(handler as (payload: never) => void); };
  }

  async setOptions(update: OEMWidgetConfig): Promise<void> {
    this.assertAlive();
    validateConfig(update);
    const snapshot = cloneConfig(update);
    const operation = this.updates.then(() => this.applyOptions(snapshot));
    this.updates = operation.catch(() => undefined);
    return operation;
  }

  private async applyOptions(update: OEMWidgetConfig): Promise<void> {
    this.assertAlive();
    const changes = Object.fromEntries(
      Object.entries(update).filter(([, value]) => value !== undefined),
    ) as OEMWidgetConfig;
    const merged: OEMWidgetConfig = { ...toConfig(this.state), ...changes };
    const nextRegionId = resolveRegionId(this.manifest, changes.region ?? this.state.regionId);

    if (nextRegionId !== this.state.regionId) {
      const preset = getPreset(getOEMRegion(this.manifest, nextRegionId));
      if (changes.floor === undefined) merged.floor = 'M';
      if (changes.subregion === undefined) merged.subregion = null;
      if (changes.center === undefined) merged.center = preset.center;
      if (changes.zoom === undefined) merged.zoom = preset.zoom;
    }

    if (changes.subregion !== undefined && changes.subregion !== this.state.subregionId) {
      const region = getOEMRegion(this.manifest, nextRegionId);
      const subregion = changes.subregion
        ? region.subregions.find((entry) => entry.id === changes.subregion)
        : undefined;
      const preset = getPreset(region, subregion);
      if (changes.center === undefined) merged.center = preset.center;
      if (changes.zoom === undefined) merged.zoom = preset.zoom;
    }

    const previous = this.state;
    const next = normalizeState(merged, this.manifest);
    if (changes.customPoints !== undefined && changes.customPointsUrl !== undefined) {
      throw new Error('Pass either customPoints or customPointsUrl, not both');
    }
    const customPointsChanged = changes.customPoints !== undefined || changes.customPointsUrl !== undefined;
    if (sameState(previous, next) && !customPointsChanged) {
      const resourceState = this.core.getResourceState();
      const requested = { points: changes.markerTypes !== undefined && hasMarkers(next), labels: changes.labels === true, boundaries: changes.boundaries === true };
      await Promise.all((Object.keys(requested) as OEMFeatureName[]).filter(feature => requested[feature] && resourceState[feature].status === 'error').map(feature => this.core.retry(feature)));
      this.assertAlive();
      return;
    }

    const regionChanged = next.regionId !== previous.regionId;
    const filterChanged = next.subregionId !== previous.subregionId ||
      !sameMarkers(next.markerTypes, previous.markerTypes);
    const viewChanged = regionChanged ||
      next.floorId !== previous.floorId ||
      next.zoom !== previous.zoom ||
      next.center.x !== previous.center.x ||
      next.center.z !== previous.center.z;
    const previousMarkers = hasMarkers(previous);
    const nextMarkers = hasMarkers(next);

    this.applying = true;
    this.root.classList.add('loading');
    try {
      if (changes.customPoints !== undefined) {
        this.core.setCustomPoints(changes.customPoints);
        this.customPointsUrl = undefined;
      } else if (changes.customPointsUrl !== undefined) {
        await this.core.loadCustomPoints(changes.customPointsUrl);
        this.assertAlive();
        this.customPointsUrl = changes.customPointsUrl;
      }
      if (previousMarkers && !nextMarkers) await this.core.setFeatures({ points: false });
      if (filterChanged) {
        this.core.setPointFilter({
          types: next.markerTypes === '*' ? undefined : next.markerTypes,
          subregions: next.subregionId ? [next.subregionId] : undefined,
        });
      }
      if (regionChanged) await this.core.setRegion(next.regionId);
      if (next.locale !== previous.locale) await this.core.setLocale(next.locale);
      if (next.floorId !== previous.floorId) this.core.setFloor(next.floorId);
      if (next.markerClustering !== previous.markerClustering) {
        this.core.setMarkerClustering(next.markerClustering);
      }
      if (nextMarkers !== previousMarkers ||
        next.labels !== previous.labels ||
        next.boundaries !== previous.boundaries ||
        next.boundarySource !== previous.boundarySource) {
        await this.core.setFeatures({
          points: nextMarkers,
          labels: next.labels,
          boundaries: next.boundaries,
          boundarySource: next.boundarySource,
        });
      }
      if (viewChanged) {
        this.core.setView({
          regionId: next.regionId,
          floorId: next.floorId,
          x: next.center.x,
          z: next.center.z,
          zoom: next.zoom,
        });
      }
      this.assertAlive();
      const view = this.core.getView();
      this.state = {
        ...next,
        locale: this.core.getLocale().resolved as OEMLocale,
        center: { x: view.x, z: view.z },
        zoom: view.zoom,
      };
      this.controls.sync(this.state);
    } finally {
      this.applying = false;
      this.root.classList.remove('loading');
    }
    this.notify();
  }

  resize(): void {
    this.assertAlive();
    this.core.resize();
  }

  destroy = (): void => {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeView();
    this.unsubscribeClick();
    this.unsubscribeResource();
    this.listeners.clear();
    this.controls.destroy?.();
    this.options.signal?.removeEventListener('abort', this.destroy);
    this.core.destroy();
    this.root.remove();
    this.releaseHost();
  };
}

/** Creates an embeddable Open Endfield Map Widget. */
export async function createOEMWidget(
  container: string | HTMLElement,
  options: OEMWidgetOptions = {},
): Promise<OEMWidget> {
  if (typeof document === 'undefined') throw new Error('createOEMWidget must run in a browser');
  validateConfig(options);
  if (options.customPoints !== undefined && options.customPointsUrl !== undefined) {
    throw new Error('Pass either customPoints or customPointsUrl, not both');
  }
  options.signal?.throwIfAborted();
  const host = resolveContainer(container);
  if (mounted.has(host)) throw new Error('This container already hosts an OEM Widget');

  const root = document.createElement('div');
  root.className = 'oemWidget loading';
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));
  root.dataset.theme = options.theme ?? 'light';
  const mapHost = document.createElement('div');
  mapHost.className = 'mapHost';
  root.append(mapHost);
  host.append(root);
  const token = Symbol('OEM Widget creation');
  mounted.set(host, token);

  let core: OEM | undefined;
  let widget: Widget | undefined;
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  const releaseHost = () => {
    options.signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', cancel);
    root.remove();
    if (mounted.get(host) === token) mounted.delete(host);
  };
  const cancel = () => {
    if (widget) widget.destroy();
    else {
      core?.destroy();
      releaseHost();
    }
  };
  controller.signal.addEventListener('abort', cancel, { once: true });
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  try {
    controller.signal.throwIfAborted();
    const resources: OEMResources = options.resources ?? defaultOEMResources;
    const manifest = options.manifest !== undefined
      ? checkOEMManifestVersion(options.manifest)
      : await loadOEMManifest(resources, controller.signal);
    controller.signal.throwIfAborted();
    installFonts(root, manifest, resources);
    const state = normalizeState(options, manifest);
    core = await createOEM(mapHost, {
      resources,
      manifest,
      regionId: state.regionId,
      floorId: state.floorId,
      locale: state.locale,
      theme: options.theme,
      view: {
        regionId: state.regionId,
        floorId: state.floorId,
        x: state.center.x,
        z: state.center.z,
        zoom: state.zoom,
      },
        features: {
          points: hasMarkers(state),
          labels: state.labels,
          boundaries: state.boundaries,
          boundarySource: state.boundarySource,
        },
      markerClustering: state.markerClustering,
      customPoints: options.customPoints,
      customPointsUrl: options.customPointsUrl,
      pointFilter: {
        types: state.markerTypes === '*' ? undefined : state.markerTypes,
        subregions: state.subregionId ? [state.subregionId] : undefined,
      },
      lockDrag: options.lockDrag ?? false,
      lockZoom: options.lockZoom ?? false,
      signal: controller.signal,
      onError: options.onError,
    });
    controller.signal.throwIfAborted();
    widget = new Widget(host, root, core, manifest, { ...options, signal: controller.signal }, state, releaseHost);
    root.classList.remove('loading');
    options.onReady?.(widget);
    return widget;
  } catch (error) {
    if (widget) widget.destroy();
    else {
      core?.destroy();
      controller.abort();
      releaseHost();
    }
    throw error;
  }
}
