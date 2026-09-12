import { fetchOEMJson, loadOEMManifest, resolveOEMAsset } from '@opendfieldmap/core';
import type { OEMManifest, OEMPointType, OEMResources } from '@opendfieldmap/core';
import { createOEMWidget, createClickPointTool, parseOEMUrlState } from '@opendfieldmap/sdk';
import type { OEMClickPointTool, OEMCustomPoint, OEMMapClick, OEMWidget, OEMWidgetConfig, OEMWidgetState } from '@opendfieldmap/sdk';
import '@opendfieldmap/sdk/style.css';
import { createDemoConfigPanel } from './configPanel';
import type { DemoConfigPanel, DemoCreationConfig, DemoVersionOption } from './configPanel';
import { createDemoCustomPointsPanel } from './customPointsPanel';
import type { DemoCustomPointsPanel } from './customPointsPanel';
import { createDemoClickPointsPanel } from './clickPointsPanel';
import type { DemoClickPointsPanel, OEMClickPointMode } from './clickPointsPanel';
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
  center: { x: 3848, z: -5072 },
};
const defaultCreation: DemoCreationConfig = {
  showRegionSelector: true,
  showFloorSelector: false,
  horizontalSelectors: false,
  showScaleBar: true,
  lockDrag: false,
  lockZoom: false,
  theme: 'light',
};
const instanceIcon = new URL('../assets/instance.webp', import.meta.url).href;
// Bump this key whenever the demo's custom-point JSON schema/content changes.
const customPointsCacheKey = 'xz-v2';
const defaultCustomPointsUrl = usesLocalResources
  ? `${new URL('/examples/basic/custom-points.json', document.baseURI).href}?v=${customPointsCacheKey}`
  : `${new URL('assets/custom-points.json', document.baseURI).href}?v=${customPointsCacheKey}`;
const defaultCustomPoints: OEMCustomPoint[] = [
  {
    id: 'custom-instance-1',
    position: { regionId: 'Valley_4', x: 400, z: -562.5, floorId: 'M' },
    style: 'framed',
    icon: instanceIcon,
  },
  {
    id: 'custom-instance-2',
    position: { regionId: 'Valley_4', x: 500, z: -631.25, floorId: 'M' },
    style: 'framed',
    icon: instanceIcon,
  },
  {
    id: 'custom-instance-3',
    position: { regionId: 'Valley_4', x: 575, z: -712.5, floorId: 'M' },
    style: 'framed',
    icon: instanceIcon,
  },
];

let widget: OEMWidget | undefined;
let panel: DemoConfigPanel | undefined;
let customPointsPanel: DemoCustomPointsPanel | undefined;
let clickPointsPanel: DemoClickPointsPanel | undefined;
let manifest: OEMManifest;
let versions: readonly DemoVersionOption[] = [];
let selectedVersion: DemoVersionOption;
let creation = { ...defaultCreation };
let customPoints: OEMCustomPoint[] = defaultCustomPoints.map((point) => ({ ...point, position: { ...point.position } }));
let customPointsUrl: string | undefined = defaultCustomPointsUrl;
let clickPointMode: OEMClickPointMode = 'multiple';
let clickTool: OEMClickPointTool | undefined;
let operation = Promise.resolve();

const reportError = (cause: unknown) => {
  error.textContent = cause instanceof Error ? cause.message : String(cause);
  error.hidden = false;
};

const handleMapClick = (click: OEMMapClick): void => {
  customPointsPanel?.setPickStatus(click);
};

const applyClickPointMode = (mode: OEMClickPointMode): void => {
  clickPointMode = mode;
  clickPointsPanel?.setMode(mode);
  const tool = clickTool;
  void tool?.setMode(mode).catch(error => { if (!tool.destroyed) reportError(error); });
};

const toConfig = (state: OEMWidgetState): OEMWidgetConfig => ({
  region: state.regionId,
  subregion: state.subregionId,
  floor: state.floorId,
  locale: state.locale,
  markerTypes: state.markerTypes === '*' ? '*' : [...state.markerTypes],
  labels: state.labels,
  boundaries: state.boundaries,
  boundarySource: state.boundarySource,
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
  clickTool = createClickPointTool(widget.map, { mode: clickPointMode, style: 'framed', icon: instanceIcon });
  customPoints = widget.map.getCustomPoints();
  widget.on('custompointschange', () => {
    customPoints = widget!.map.getCustomPoints();
    customPointsUrl = undefined;
    customPointsPanel?.setPoints(customPoints);
    panel?.sync(widget!.getState(), creation, customPoints, customPointsUrl);
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
    clickPointsPanel?.setBusy(true);
    try {
      await task();
      return true;
    } catch (cause) {
      reportError(cause);
      return false;
    } finally {
      panel?.setBusy(false);
      customPointsPanel?.setBusy(false);
      clickPointsPanel?.setBusy(false);
    }
  });
  operation = result.then(() => undefined);
  return result;
};

customPointsPanel = createDemoCustomPointsPanel(defaultCustomPoints, {
  apply(points) {
    return enqueue(async () => {
      await widget?.setCustomPoints(points);
      customPointsUrl = undefined;
      customPoints = points.map((point) => ({ ...point, position: { ...point.position } }));
      customPointsPanel?.setPoints(customPoints);
      if (widget) panel?.sync(widget.getState(), creation, customPoints, customPointsUrl);
    });
  },
});
app.append(customPointsPanel.element);

clickPointsPanel = createDemoClickPointsPanel(clickPointMode, {
  setMode: applyClickPointMode,
});
app.append(clickPointsPanel.element);

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
    clickPointMode = 'multiple';

    clickPointsPanel?.setMode(clickPointMode);
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
    clickPointsPanel?.destroy();
    widget?.destroy();
  }, { once: true });
};

void initialize().catch(reportError);
