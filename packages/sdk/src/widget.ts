import { defaultOEMResources, invalid, OEMError, loadOEMManifest, checkOEMManifestVersion } from '@opendfieldmap/core';
import type { OEMManifest, OEMResources } from '@opendfieldmap/core';
import { createOEM, resolveOEMMapConfig } from '@opendfieldmap/map';
import type { OEM, OEMCustomPoint, OEMFeatureName, OEMResourceStates } from '@opendfieldmap/map';
import { mountControls } from './components';
import type { Control } from './components/types';
import { installFonts } from './fonts';
import type { OEMWidget, OEMWidgetConfig, OEMWidgetEvents, OEMWidgetOptions, OEMWidgetState } from './types';

const mounted = new WeakMap<HTMLElement, symbol>();
const resolveContainer = (container: string | HTMLElement): HTMLElement => {
  const element = typeof container === 'string' ? document.querySelector<HTMLElement>(container) : container;
  if (!element) throw new Error(`OEM Widget container not found: ${container}`);
  return element;
};
const hasMarkers = (state: OEMWidgetState) => state.markerTypes === '*' || state.markerTypes.length > 0;

class Widget implements OEMWidget {
  destroyed = false;
  private controls: Control;
  private zoomLocked: boolean;
  private unsubscribeState: () => void;
  private unsubscribeDestroy: () => void;

  constructor(
    private root: HTMLElement,
    readonly map: OEM,
    private manifest: OEMManifest,
    private options: OEMWidgetOptions,
    private releaseHost: () => void,
  ) {
    this.zoomLocked = map.getState().lockZoom;
    this.controls = this.mount();
    this.controls.sync(map.getState());
    this.unsubscribeState = map.on('statechange', this.sync);
    this.unsubscribeDestroy = map.on('destroy', this.destroy);
    options.signal?.addEventListener('abort', this.destroy, { once: true });
  }
  private assertAlive(): void { if (this.destroyed) throw new Error('OEM Widget has been destroyed'); }
  private report(error: unknown): void {
    if (this.destroyed) return;
    try { this.options.onError?.(error instanceof Error ? error : new Error(String(error))); }
    catch (cause) { console.error(new OEMError('CALLBACK_FAILED', 'onError', 'OEM error handler failed', undefined, { cause })); }
  }
  private mount(): Control {
    return mountControls(this.root, {
      regionSelector: this.options.showRegionSelector ?? true,
      floorSelector: this.options.showFloorSelector ?? true,
      scaleBar: this.options.showScaleBar ?? true,
      horizontalSelectors: this.options.horizontalSelectors ?? false,
    }, { manifest: this.manifest, zoomLocked: this.zoomLocked,
      apply: update => { void this.map.update(update).catch(error => this.report(error)); },
      zoomTo: (zoom, options) => { void this.map.setZoom(zoom, options).catch(error => this.report(error)); },
    });
  }
  private sync = (state: OEMWidgetState): void => {
    if (this.destroyed) return;
    this.root.dataset.theme = state.theme;
    if (state.lockZoom !== this.zoomLocked) {
      this.zoomLocked = state.lockZoom; this.controls.destroy?.(); this.controls = this.mount();
    }
    this.controls.sync(state);
    try { this.options.onStateChange?.(this.map.getState()); }
    catch (cause) { this.report(new OEMError('CALLBACK_FAILED', 'onStateChange', 'OEM state handler failed', undefined, { cause })); }
  };
  getState(): OEMWidgetState { this.assertAlive(); return this.map.getState(); }
  getResourceState(): OEMResourceStates { this.assertAlive(); return this.map.getResourceState(); }
  retry(feature?: OEMFeatureName): Promise<void> { this.assertAlive(); return this.map.retry(feature); }
  setOptions(config: OEMWidgetConfig): Promise<void> { this.assertAlive(); return this.map.update(config); }
  setCustomPoints(points: readonly OEMCustomPoint[]): Promise<void> { this.assertAlive(); return this.map.setCustomPoints(points); }
  loadCustomPoints(url: string): Promise<void> { this.assertAlive(); return this.map.loadCustomPoints(url); }
  clearCustomPoints(): Promise<void> { this.assertAlive(); return this.map.clearCustomPoints(); }
  getPoint(id: string) { this.assertAlive(); return this.map.getPoint(id); }
  loadPoint(id: string) { this.assertAlive(); return this.map.loadPoint(id); }
  on<Event extends keyof OEMWidgetEvents>(event: Event, handler: (payload: OEMWidgetEvents[Event]) => void): () => void {
    this.assertAlive(); return this.map.on(event, handler);
  }
  resize(): void { this.assertAlive(); this.map.resize(); }
  destroy = (): void => {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeState(); this.unsubscribeDestroy(); this.controls.destroy?.();
    this.options.signal?.removeEventListener('abort', this.destroy);
    this.map.destroy(); this.releaseHost();
  };
}

/** Creates an embeddable Open Endfield Map Widget. */
export async function createOEMWidget(
  container: string | HTMLElement,
  options: OEMWidgetOptions = {},
): Promise<OEMWidget> {
  if (typeof document === 'undefined') throw new Error('createOEMWidget must run in a browser');
  if (!options || typeof options !== 'object') invalid('options', 'Expected options');
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
    const state = resolveOEMMapConfig(options, manifest);
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
    widget = new Widget(root, core, manifest, { ...options, signal: controller.signal }, releaseHost);
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
