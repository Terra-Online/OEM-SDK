import { fetchOEMJson, loadOEMManifest, resolveOEMAsset } from '@opendfieldmap/core';
import type { OEMManifest, OEMPointType, OEMResources } from '@opendfieldmap/core';
import { createOEMWidget, parseOEMUrlState } from '@opendfieldmap/sdk';
import type { OEMWidget, OEMWidgetConfig, OEMWidgetState } from '@opendfieldmap/sdk';
import '@opendfieldmap/sdk/style.css';
import { createDemoConfigPanel } from './configPanel';
import type { DemoConfigPanel, DemoCreationConfig } from './configPanel';
import './style.scss';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Demo root not found');

const widgetHost = document.createElement('div');
widgetHost.id = 'widgetHost';
const error = document.createElement('div');
error.className = 'demoError';
error.hidden = true;
error.setAttribute('role', 'alert');
app.append(widgetHost, error);

const urlOptions = window.location.search ? parseOEMUrlState(window.location.search) : {};
const resources: OEMResources = {
  baseUrl: '/',
  manifestPath: '/channels/stable.json',
};
const defaultMarkerTypes = ['gather', 'aurylene', 'crate_i', 'protocolith_spot'];
const defaultConfig: OEMWidgetConfig = {
  region: 'Valley_4',
  floor: 'M',
  locale: 'zh-CN',
  markerTypes: defaultMarkerTypes,
  labels: true,
  boundaries: true,
  markerClustering: true,
  zoom: 2,
};
const defaultCreation: DemoCreationConfig = {
  showRegionSelector: true,
  showFloorSelector: true,
  showScaleBar: true,
  lockDrag: false,
  lockZoom: false,
  theme: 'light',
};

let widget: OEMWidget | undefined;
let panel: DemoConfigPanel | undefined;
let manifest: OEMManifest;
let creation = { ...defaultCreation };
let operation = Promise.resolve();

const reportError = (cause: unknown) => {
  error.textContent = cause instanceof Error ? cause.message : String(cause);
  error.hidden = false;
};

const toConfig = (state: OEMWidgetState): OEMWidgetConfig => ({
  region: state.regionId,
  subregion: state.subregionId,
  floor: state.floorId,
  locale: state.locale,
  markerTypes: state.markerTypes === '*' ? '*' : [...state.markerTypes],
  labels: state.labels,
  boundaries: state.boundaries,
  markerClustering: state.markerClustering,
  zoom: state.zoom,
  center: { ...state.center },
});

const mountWidget = async (config: OEMWidgetConfig): Promise<void> => {
  widget = await createOEMWidget(widgetHost, {
    resources,
    manifest,
    ...config,
    ...creation,
    onStateChange: (state) => panel?.sync(state, creation),
    onError: reportError,
  });
  panel?.sync(widget.getState(), creation);
};

/** Serializes Demo operations so expensive layer updates cannot overlap. */
const enqueue = (task: () => Promise<void>): void => {
  operation = operation.then(async () => {
    error.hidden = true;
    panel?.setBusy(true);
    try {
      await task();
    } catch (cause) {
      reportError(cause);
    } finally {
      panel?.setBusy(false);
    }
  });
};

const initialize = async () => {
  manifest = await loadOEMManifest(resources);
  const pointTypes = await fetchOEMJson<Record<string, OEMPointType>>(resolveOEMAsset(resources.baseUrl, manifest.types.path));
  await mountWidget({ ...defaultConfig, ...urlOptions });
  panel = createDemoConfigPanel(manifest, pointTypes, defaultMarkerTypes, {
    update(update) {
      enqueue(async () => {
        await widget?.setOptions(update);
        if (widget) panel?.sync(widget.getState(), creation);
      });
    },
    recreate(update) {
      creation = { ...creation, ...update };
      enqueue(async () => {
        const config = widget ? toConfig(widget.getState()) : defaultConfig;
        widget?.destroy();
        widget = undefined;
        await mountWidget(config);
      });
    },
    reset() {
      creation = { ...defaultCreation };
      enqueue(async () => {
        widget?.destroy();
        widget = undefined;
        await mountWidget(defaultConfig);
      });
    },
  });
  app.append(panel.element);
  if (!widget) throw new Error('Demo Widget failed to initialize');
  panel.sync(widget.getState(), creation);

  window.addEventListener('beforeunload', () => widget?.destroy(), { once: true });
};

void initialize().catch(reportError);
