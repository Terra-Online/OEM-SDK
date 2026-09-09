import { fetchOEMJson, loadOEMManifest, resolveOEMAsset } from '@opendfieldmap/core';
import type { OEMManifest, OEMPointType, OEMResources } from '@opendfieldmap/core';
import { createOEMWidget, parseOEMUrlState } from '@opendfieldmap/sdk';
import type { OEMCustomPoint, OEMMapClick, OEMWidget, OEMWidgetConfig, OEMWidgetState } from '@opendfieldmap/sdk';
import '@opendfieldmap/sdk/style.css';
import { createDemoConfigPanel } from './configPanel';
import type { DemoConfigPanel, DemoCreationConfig, DemoVersionOption } from './configPanel';
import { createDemoCustomPointsPanel } from './customPointsPanel';
import type { DemoCustomPointsPanel } from './customPointsPanel';
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
const usesLocalResources = document.querySelector('script[src="/@vite/client"]') !== null;
const stableResources: OEMResources = usesLocalResources
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
const instanceIcon = new URL('../assets/instance.webp', import.meta.url).href;
const defaultCustomPointsUrl = new URL('./custom-points.json', import.meta.url).href;
const defaultCustomPoints: OEMCustomPoint[] = [
  {
    id: 'custom-instance-1',
    position: { regionId: 'Valley_4', x: 400, y: 562.5, floorId: 'M' },
    style: 'framed',
    icon: instanceIcon,
  },
  {
    id: 'custom-instance-2',
    position: { regionId: 'Valley_4', x: 500, y: 631.25, floorId: 'M' },
    style: 'framed',
    icon: instanceIcon,
  },
  {
    id: 'custom-instance-3',
    position: { regionId: 'Valley_4', x: 575, y: 712.5, floorId: 'M' },
    style: 'framed',
    icon: instanceIcon,
  },
];

let widget: OEMWidget | undefined;
let panel: DemoConfigPanel | undefined;
let customPointsPanel: DemoCustomPointsPanel | undefined;
let manifest: OEMManifest;
let versions: readonly DemoVersionOption[] = [];
let selectedVersion: DemoVersionOption;
let creation = { ...defaultCreation };
let customPoints: OEMCustomPoint[] = defaultCustomPoints.map((point) => ({ ...point, position: { ...point.position } }));
let customPointsUrl: string | undefined = defaultCustomPointsUrl;
let operation = Promise.resolve();

const reportError = (cause: unknown) => {
  error.textContent = cause instanceof Error ? cause.message : String(cause);
  error.hidden = false;
};

const handleMapClick = (click: OEMMapClick): void => {
  customPointsPanel?.setPickStatus(click);
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
    ...(customPointsUrl ? { customPointsUrl } : { customPoints }),
    ...creation,
    onStateChange: (state) => panel?.sync(state, creation, customPoints, customPointsUrl),
    onError: reportError,
  });
  widget.on('click', handleMapClick);
  panel?.sync(widget.getState(), creation, customPoints, customPointsUrl);
  return widget;
};

const loadVersion = async (
  version: DemoVersionOption,
  config: OEMWidgetConfig,
  preloadedManifest?: OEMManifest,
): Promise<void> => {
  const resources: OEMResources = { baseUrl: stableResources.baseUrl, manifestPath: version.manifestPath };
  const nextManifest = preloadedManifest ?? await loadOEMManifest(resources);

  widget?.destroy();
  widget = undefined;
  panel?.destroy();
  panel?.element.remove();
  panel = undefined;
  manifest = nextManifest;
  selectedVersion = version;
  const [pointTypes, mountedWidget] = await Promise.all([
    fetchOEMJson<Record<string, OEMPointType>>(
      resolveOEMAsset(resources.baseUrl, nextManifest.types.path),
    ),
    mountWidget(config),
  ]);
  panel = createDemoConfigPanel(manifest, pointTypes, defaultMarkerTypes, panelCallbacks, {
    selected: selectedVersion.id,
    options: versions,
  });
  app.append(panel.element);
  panel.sync(mountedWidget.getState(), creation, customPoints, customPointsUrl);
};

/** Serializes Demo operations so expensive layer updates cannot overlap. */
const enqueue = (task: () => Promise<void>): Promise<boolean> => {
  const result = operation.then(async () => {
    error.hidden = true;
    panel?.setBusy(true);
    customPointsPanel?.setBusy(true);
    try {
      await task();
      return true;
    } catch (cause) {
      reportError(cause);
      return false;
    } finally {
      panel?.setBusy(false);
      customPointsPanel?.setBusy(false);
    }
  });
  operation = result.then(() => undefined);
  return result;
};

customPointsPanel = createDemoCustomPointsPanel(defaultCustomPoints, {
  apply(points) {
    return enqueue(async () => {
      widget?.setCustomPoints(points);
      customPointsUrl = undefined;
      customPoints = points.map((point) => ({ ...point, position: { ...point.position } }));
      customPointsPanel?.setPoints(customPoints);
      if (widget) panel?.sync(widget.getState(), creation, customPoints, customPointsUrl);
    });
  },
});
app.append(customPointsPanel.element);

const panelCallbacks = {
  update(update: OEMWidgetConfig) {
    enqueue(async () => {
      await widget?.setOptions(update);
      if (widget) panel?.sync(widget.getState(), creation, customPoints, customPointsUrl);
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
      customPoints = defaultCustomPoints.map((point) => ({ ...point, position: { ...point.position } }));
      customPointsUrl = defaultCustomPointsUrl;
      customPointsPanel?.setPoints(customPoints);
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
    customPointsPanel?.destroy();
    widget?.destroy();
  }, { once: true });
};

void initialize().catch(reportError);
