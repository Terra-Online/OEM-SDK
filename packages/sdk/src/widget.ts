import {
  defaultOEMResources,
  getOEMRegion,
  loadOEMManifest,
  normalizeOEMLocale,
  validateOEMManifest,
} from '@opendfieldmap/core';
import type { OEMManifest, OEMRegion, OEMResources, OEMSubregion } from '@opendfieldmap/core';
import { createOEM } from '@opendfieldmap/map';
import type { OEM, OEMCustomPoint, OEMMapClick } from '@opendfieldmap/map';
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

const mounted = new WeakSet<HTMLElement>();

const cloneState = (state: OEMWidgetState): OEMWidgetState => ({
  ...state,
  markerTypes: state.markerTypes === '*' ? '*' : [...state.markerTypes],
  center: { ...state.center },
});

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

const getPreset = (region: OEMRegion, subregion?: OEMSubregion) => {
  if (!subregion?.bounds) {
    return {
      center: { x: region.initialView.x, y: region.initialView.y },
      zoom: region.initialView.zoom,
    };
  }
  return {
    center: {
      x: (subregion.bounds[0][0] + subregion.bounds[1][0]) / 2,
      y: (subregion.bounds[0][1] + subregion.bounds[1][1]) / 2,
    },
    zoom: Math.max(region.minZoom, Math.min(region.maxZoom, 1)),
  };
};

const normalizeState = (input: OEMWidgetConfig, manifest: OEMManifest): OEMWidgetState => {
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
  if (requestedCenter && (!Number.isFinite(requestedCenter.x) || !Number.isFinite(requestedCenter.y))) {
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
    markerClustering: input.markerClustering ?? true,
    zoom: Math.max(region.minZoom, Math.min(region.maxZoom, input.zoom ?? preset.zoom)),
    center: {
      x: requestedCenter?.x ?? preset.center.x,
      y: requestedCenter?.y ?? preset.center.y,
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
  left.markerClustering === right.markerClustering &&
  left.zoom === right.zoom &&
  left.center.x === right.center.x &&
  left.center.y === right.center.y;

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
  private listeners = new Map<keyof OEMWidgetEvents, Set<(payload: never) => void>>();

  constructor(
    private host: HTMLElement,
    private root: HTMLElement,
    private core: OEM,
    private manifest: OEMManifest,
    private options: OEMWidgetOptions,
    private state: OEMWidgetState,
  ) {
    this.customPointsUrl = options.customPointsUrl;
    this.controls = mountControls(root, {
      regionSelector: options.showRegionSelector ?? true,
      floorSelector: options.showFloorSelector ?? true,
      scaleBar: options.showScaleBar ?? true,
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
    options.signal?.addEventListener('abort', this.destroy, { once: true });
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('OEM Widget has been destroyed');
  }

  private report(error: unknown): void {
    this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
  }

  private notify(): void {
    this.options.onStateChange?.(cloneState(this.state));
  }

  private emit<Event extends keyof OEMWidgetEvents>(event: Event, payload: OEMWidgetEvents[Event]): void {
    this.listeners.get(event)?.forEach((handler) => handler(payload as never));
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
      center: { x: view.x, y: view.y },
      zoom: view.zoom,
    };
    this.controls.sync(this.state);
    this.notify();
  };

  getState(): OEMWidgetState {
    this.assertAlive();
    return cloneState(this.state);
  }

  setCustomPoints(points: readonly OEMCustomPoint[]): void {
    this.assertAlive();
    this.core.setCustomPoints(points);
    this.customPointsUrl = undefined;
  }

  async loadCustomPoints(url: string): Promise<void> {
    this.assertAlive();
    await this.core.loadCustomPoints(url);
    this.customPointsUrl = url;
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

  setOptions(update: OEMWidgetConfig): Promise<void> {
    this.assertAlive();
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
    if (sameState(previous, next) && !customPointsChanged) return;

    const regionChanged = next.regionId !== previous.regionId;
    const filterChanged = next.subregionId !== previous.subregionId ||
      !sameMarkers(next.markerTypes, previous.markerTypes);
    const viewChanged = regionChanged ||
      next.floorId !== previous.floorId ||
      next.zoom !== previous.zoom ||
      next.center.x !== previous.center.x ||
      next.center.y !== previous.center.y;
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
        next.boundaries !== previous.boundaries) {
        await this.core.setFeatures({
          points: nextMarkers,
          labels: next.labels,
          boundaries: next.boundaries,
        });
      }
      if (viewChanged) {
        this.core.setView({
          regionId: next.regionId,
          floorId: next.floorId,
          x: next.center.x,
          y: next.center.y,
          zoom: next.zoom,
        });
      }
      const view = this.core.getView();
      this.state = {
        ...next,
        locale: this.core.getLocale().resolved as OEMLocale,
        center: { x: view.x, y: view.y },
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
    this.listeners.clear();
    this.controls.destroy?.();
    this.options.signal?.removeEventListener('abort', this.destroy);
    this.core.destroy();
    this.root.remove();
    mounted.delete(this.host);
  };
}

/** Creates an embeddable Open Endfield Map Widget. */
export async function createOEMWidget(
  container: string | HTMLElement,
  options: OEMWidgetOptions = {},
): Promise<OEMWidget> {
  if (typeof document === 'undefined') throw new Error('createOEMWidget must run in a browser');
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
  mounted.add(host);

  let core: OEM | undefined;
  let widget: Widget | undefined;
  try {
    const resources: OEMResources = options.resources ?? defaultOEMResources;
    const manifest = options.manifest
      ? validateOEMManifest(options.manifest)
      : await loadOEMManifest(resources, options.signal);
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
        y: state.center.y,
        zoom: state.zoom,
      },
      features: {
        points: hasMarkers(state),
        labels: state.labels,
        boundaries: state.boundaries,
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
      signal: options.signal,
      onError: options.onError,
    });
    widget = new Widget(host, root, core, manifest, options, state);
    root.classList.remove('loading');
    options.onReady?.(widget);
    return widget;
  } catch (error) {
    if (widget) widget.destroy();
    else {
      core?.destroy();
      root.remove();
      mounted.delete(host);
    }
    throw error;
  }
}
