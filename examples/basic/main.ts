import { fetchOEMJson, loadOEMManifest, resolveOEMAsset } from '@opendfieldmap/core';
import type { OEMManifest, OEMPointType, OEMResources } from '@opendfieldmap/core';
import { createOEMWidget, parseOEMUrlState } from '@opendfieldmap/sdk';
import type { OEMWidget, OEMWidgetConfig, OEMWidgetState } from '@opendfieldmap/sdk';
import '@opendfieldmap/sdk/style.css';
import { createDemoConfigPanel } from './configPanel';
import type { DemoConfigPanel, DemoCreationConfig, DemoVersionOption } from './configPanel';
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
const isLocalPreview = window.location.hostname === '127.0.0.1' && window.location.port === '4173';
const stableResources: OEMResources = isLocalPreview
  ? { baseUrl: window.location.origin, manifestPath: '/channels/stable.json' }
  : { baseUrl: 'https://data.opendfieldmap.org', manifestPath: '/channels/stable.json' };
const defaultMarkerTypes = ['aurylene', 'crate_i', 'crate_ii', 'crate_iii', 'cratesurprise', 'cratelocked'];
const defaultConfig: OEMWidgetConfig = {
  region: 'VL',
  locale: 'en-US',
  subregion: 'VL_1',
  markerTypes: defaultMarkerTypes,
  center: { x: 3848, y: 5072 },
};
const defaultCreation: DemoCreationConfig = {
  showRegionSelector: true,
  showFloorSelector: false,
  showScaleBar: true,
  lockDrag: false,
  lockZoom: false,
  theme: 'light',
};

let widget: OEMWidget | undefined;
let panel: DemoConfigPanel | undefined;
let manifest: OEMManifest;
let versions: readonly DemoVersionOption[] = [];
let selectedVersion: DemoVersionOption;
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

const mountWidget = async (config: OEMWidgetConfig): Promise<OEMWidget> => {
  const resources: OEMResources = {
    baseUrl: stableResources.baseUrl,
    manifestPath: selectedVersion.manifestPath,
  };
  widget = await createOEMWidget(widgetHost, {
    resources,
    manifest,
    ...config,
    ...creation,
    onStateChange: (state) => panel?.sync(state, creation),
    onError: reportError,
  });
  panel?.sync(widget.getState(), creation);
  return widget;
};

const loadVersion = async (
  version: DemoVersionOption,
  config: OEMWidgetConfig,
  preloadedManifest?: OEMManifest,
): Promise<void> => {
  const resources: OEMResources = { baseUrl: stableResources.baseUrl, manifestPath: version.manifestPath };
  const nextManifest = preloadedManifest ?? await loadOEMManifest(resources);
  const pointTypes = await fetchOEMJson<Record<string, OEMPointType>>(
    resolveOEMAsset(resources.baseUrl, nextManifest.types.path),
  );

  widget?.destroy();
  widget = undefined;
  panel?.destroy();
  panel?.element.remove();
  panel = undefined;
  manifest = nextManifest;
  selectedVersion = version;
  const mountedWidget = await mountWidget(config);
  panel = createDemoConfigPanel(manifest, pointTypes, defaultMarkerTypes, panelCallbacks, {
    selected: selectedVersion.id,
    options: versions,
  });
  app.append(panel.element);
  panel.sync(mountedWidget.getState(), creation);
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

const panelCallbacks = {
  update(update: OEMWidgetConfig) {
    enqueue(async () => {
      await widget?.setOptions(update);
      if (widget) panel?.sync(widget.getState(), creation);
    });
  },
  recreate(update: Partial<DemoCreationConfig>) {
    creation = { ...creation, ...update };
    enqueue(async () => {
      const config = widget ? toConfig(widget.getState()) : defaultConfig;
      widget?.destroy();
      widget = undefined;
      await mountWidget(config);
    });
  },
  selectVersion(id: string) {
    const version = versions.find((entry) => entry.id === id);
    if (!version || version.id === selectedVersion.id) return;
    enqueue(async () => {
      const config = widget ? toConfig(widget.getState()) : defaultConfig;
      await loadVersion(version, config);
    });
  },
  reset() {
    creation = { ...defaultCreation };
    enqueue(async () => {
      await loadVersion(versions[0], defaultConfig);
    });
  },
};

const initialize = async () => {
  const stableManifest = await loadOEMManifest(stableResources);
  versions = [
    {
      id: stableManifest.gameVersion,
      label: stableManifest.gameVersion.replaceAll('_', '.'),
      manifestPath: stableResources.manifestPath,
    },
  ];
  selectedVersion = versions[0];
  await loadVersion(selectedVersion, { ...defaultConfig, ...urlOptions }, stableManifest);

  window.addEventListener('beforeunload', () => {
    panel?.destroy();
    widget?.destroy();
  }, { once: true });
};

void initialize().catch(reportError);
