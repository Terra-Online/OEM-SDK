import type { OEMManifest, OEMPointType } from '@opendfieldmap/core';
import type { OEMFloorId, OEMLocale, OEMRegionSelector, OEMWidgetConfig, OEMWidgetState } from '@opendfieldmap/sdk';

const FLOOR_ORDER = ['L4', 'L3', 'L2', 'L1', 'M', 'B1', 'B2', 'B3', 'B4'];

/** Creation-only Widget options exposed by the interactive Demo. */
export interface DemoCreationConfig {
  showRegionSelector: boolean;
  showFloorSelector: boolean;
  showScaleBar: boolean;
  lockDrag: boolean;
  lockZoom: boolean;
  theme: 'light' | 'dark';
}

interface DemoConfigPanelCallbacks {
  update(config: OEMWidgetConfig): void;
  recreate(config: Partial<DemoCreationConfig>): void;
  reset(): void;
}

/** Host-side controller used to keep the Demo form synchronized with the Widget. */
export interface DemoConfigPanel {
  element: HTMLDetailsElement;
  setBusy(busy: boolean): void;
  sync(state: OEMWidgetState, creation: DemoCreationConfig): void;
}

const createOption = (value: string, label = value): HTMLOptionElement => {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
};

const createSelect = (label: string): HTMLSelectElement => {
  const select = document.createElement('select');
  select.setAttribute('aria-label', label);
  return select;
};

const createField = (label: string, control: HTMLElement, full = false): HTMLLabelElement => {
  const field = document.createElement('label');
  field.className = `demoField${full ? ' full' : ''}`;
  const caption = document.createElement('span');
  caption.className = 'demoFieldLabel';
  caption.textContent = label;
  field.append(caption, control);
  return field;
};

const createToggle = (label: string): { field: HTMLLabelElement; input: HTMLInputElement } => {
  const field = document.createElement('label');
  field.className = 'demoToggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  const text = document.createElement('span');
  text.textContent = label;
  field.append(input, text);
  return { field, input };
};

const createSection = (title: string): { fieldset: HTMLFieldSetElement; content: HTMLDivElement } => {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'demoSection';
  const legend = document.createElement('legend');
  legend.textContent = title;
  const content = document.createElement('div');
  content.className = 'demoSectionGrid';
  fieldset.append(legend, content);
  return { fieldset, content };
};

const setSelectedValues = (select: HTMLSelectElement, values: readonly string[]): void => {
  const selected = new Set(values);
  for (const option of select.options) option.selected = selected.has(option.value);
};

const quote = (value: string): string => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

/** Produces a reproducible snippet while omitting options still at SDK defaults. */
const createWidgetCode = (
  manifest: OEMManifest,
  state: OEMWidgetState,
  creation: DemoCreationConfig,
): string => {
  const region = manifest.regions.find((entry) => entry.id === state.regionId)!;
  const subregion = state.subregionId
    ? region.subregions.find((entry) => entry.id === state.subregionId)
    : undefined;
  const presetCenter = subregion?.bounds
    ? {
        x: (subregion.bounds[0][0] + subregion.bounds[1][0]) / 2,
        y: (subregion.bounds[0][1] + subregion.bounds[1][1]) / 2,
      }
    : region.initialView;
  const presetZoom = subregion ? Math.max(region.minZoom, Math.min(region.maxZoom, 1)) : region.initialView.zoom;
  const lines = [
    `  region: ${quote(state.regionId)},`,
    `  locale: ${quote(state.locale)},`,
  ];
  if (state.subregionId) lines.push(`  subregion: ${quote(state.subregionId)},`);
  if (state.floorId !== 'M') lines.push(`  floor: ${quote(state.floorId)},`);
  if (state.markerTypes === '*') lines.push("  markerTypes: '*',");
  else if (state.markerTypes.length) lines.push(`  markerTypes: [${state.markerTypes.map(quote).join(', ')}],`);
  if (!state.labels) lines.push('  labels: false,');
  if (state.boundaries) lines.push('  boundaries: true,');
  if (!state.markerClustering) lines.push('  markerClustering: false,');
  if (Math.abs(state.zoom - presetZoom) > 0.001) lines.push(`  zoom: ${Number(state.zoom.toFixed(2))},`);
  if (Math.abs(state.center.x - presetCenter.x) > 0.5 || Math.abs(state.center.y - presetCenter.y) > 0.5) {
    lines.push(`  center: { x: ${Math.round(state.center.x)}, y: ${Math.round(state.center.y)} },`);
  }
  if (!creation.showRegionSelector) lines.push('  showRegionSelector: false,');
  if (!creation.showFloorSelector) lines.push('  showFloorSelector: false,');
  if (!creation.showScaleBar) lines.push('  showScaleBar: false,');
  if (creation.lockDrag) lines.push('  lockDrag: true,');
  if (creation.lockZoom) lines.push('  lockZoom: true,');
  if (creation.theme === 'dark') lines.push("  theme: 'dark',");
  return [
    "import { createOEMWidget } from '@opendfieldmap/sdk';",
    "import '@opendfieldmap/sdk/style.css';",
    '',
    "const widget = await createOEMWidget('#map', {",
    ...lines,
    '});',
  ].join('\n');
};

/** Creates the collapsible configuration surface used only by the local Demo. */
export function createDemoConfigPanel(
  manifest: OEMManifest,
  pointTypes: Record<string, OEMPointType>,
  initialMarkerTypes: readonly string[],
  callbacks: DemoConfigPanelCallbacks,
): DemoConfigPanel {
  const element = document.createElement('details');
  element.className = 'demoPanel';
  element.open = window.matchMedia('(min-width: 720px)').matches;

  const summary = document.createElement('summary');
  summary.className = 'demoPanelSummary';
  const summaryRow = document.createElement('span');
  summaryRow.className = 'demoPanelSummaryRow';
  const heading = document.createElement('span');
  heading.className = 'demoPanelHeading';
  const disclosure = document.createElement('span');
  disclosure.className = 'demoPanelDisclosure';
  disclosure.textContent = '▶';
  disclosure.setAttribute('aria-hidden', 'true');
  const title = document.createElement('span');
  title.className = 'demoPanelTitle';
  title.textContent = 'Widget config';
  const version = document.createElement('span');
  version.className = 'demoPanelVersion';
  version.textContent = manifest.gameVersion.replaceAll('_', '.');
  heading.append(disclosure, title);
  summaryRow.append(heading, version);
  summary.append(summaryRow);
  summary.setAttribute('aria-expanded', String(element.open));

  const body = document.createElement('div');
  body.className = 'demoPanelBody';
  element.append(summary, body);
  element.classList.toggle('expanded', element.open);

  let expanded = element.open;
  let panelAnimation: Animation | null = null;
  summary.addEventListener('click', (event) => {
    event.preventDefault();
    const startHeight = element.getBoundingClientRect().height;
    panelAnimation?.cancel();
    expanded = !expanded;
    element.classList.toggle('expanded', expanded);
    summary.setAttribute('aria-expanded', String(expanded));
    if (expanded) element.open = true;
    const maximumHeight = Number.parseFloat(getComputedStyle(element).maxHeight);
    const endHeight = expanded
      ? Math.min(element.scrollHeight, Number.isFinite(maximumHeight) ? maximumHeight : element.scrollHeight)
      : summary.offsetHeight + 2;
    panelAnimation = element.animate(
      { height: [`${startHeight}px`, `${endHeight}px`] },
      { duration: 240, easing: 'cubic-bezier(0.6, 0, 0, 1)' },
    );
    panelAnimation.onfinish = () => {
      if (!expanded) element.open = false;
      panelAnimation = null;
    };
  });

  const regionSelect = createSelect('Region');
  for (const region of manifest.regions) regionSelect.append(createOption(region.id, region.locales['en-US'] ?? region.name));
  const subregionSelect = createSelect('Subregion');
  const floorSelect = createSelect('Floor');
  const localeSelect = createSelect('Language');
  for (const locale of Object.keys(manifest.locales).sort()) localeSelect.append(createOption(locale));
  const themeSelect = createSelect('Theme');
  themeSelect.append(createOption('light', 'Light'), createOption('dark', 'Dark'));

  const zoomWrap = document.createElement('span');
  zoomWrap.className = 'demoRange';
  const zoomInput = document.createElement('input');
  zoomInput.type = 'range';
  zoomInput.step = '0.05';
  zoomInput.setAttribute('aria-label', 'Zoom');
  const zoomValue = document.createElement('output');
  zoomWrap.append(zoomInput, zoomValue);
  const centerX = document.createElement('input');
  centerX.type = 'number';
  centerX.step = '1';
  centerX.setAttribute('aria-label', 'Center X');
  const centerY = document.createElement('input');
  centerY.type = 'number';
  centerY.step = '1';
  centerY.setAttribute('aria-label', 'Center Y');

  const view = createSection('View');
  view.fieldset.classList.add('demoViewSection');
  view.content.append(
    createField('Region', regionSelect),
    createField('Subregion', subregionSelect),
    createField('Floor', floorSelect),
    createField('Language', localeSelect),
    createField('Theme', themeSelect),
    createField('Zoom', zoomWrap),
    createField('Center X', centerX),
    createField('Center Y', centerY),
  );

  const markerMode = document.createElement('div');
  markerMode.className = 'demoSegments';
  markerMode.setAttribute('role', 'group');
  markerMode.setAttribute('aria-label', 'Marker data');
  const markerModes = new Map<string, HTMLInputElement>();
  for (const [value, label] of [['none', 'None'], ['selected', 'Selected'], ['all', 'All']]) {
    const segment = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'demoMarkerMode';
    input.value = value;
    const text = document.createElement('span');
    text.textContent = label;
    segment.append(input, text);
    markerMode.append(segment);
    markerModes.set(value, input);
  }
  const markerSelect = createSelect('Marker types');
  markerSelect.multiple = true;
  markerSelect.size = 6;
  for (const key of Object.keys(pointTypes).sort()) markerSelect.append(createOption(key));
  const markerCount = document.createElement('output');
  markerCount.className = 'demoMarkerCount';
  const markerCaption = document.createElement('span');
  markerCaption.className = 'demoFieldLabel demoMarkerLabel';
  markerCaption.append(document.createTextNode('Marker types'), markerCount);
  const markerField = createField('', markerSelect, true);
  markerField.firstElementChild?.replaceWith(markerCaption);

  const labels = createToggle('Place names');
  const boundaries = createToggle('Boundaries');
  const clustering = createToggle('Clustering');
  const content = createSection('Content');
  content.fieldset.classList.add('demoContentSection');
  content.content.append(createField('Marker data', markerMode, true), markerField, labels.field, boundaries.field, clustering.field);

  const regionSelector = createToggle('Region selector');
  const floorSelector = createToggle('Floor selector');
  const scaleBar = createToggle('Scale bar');
  const lockDrag = createToggle('Lock dragging');
  const lockZoom = createToggle('Lock zooming');
  const controls = createSection('Controls');
  controls.fieldset.classList.add('demoControlsSection');
  controls.content.append(regionSelector.field, floorSelector.field, scaleBar.field, lockDrag.field, lockZoom.field);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'demoReset';
  reset.textContent = 'Reset';
  const codeSection = document.createElement('section');
  codeSection.className = 'demoCodeSection';
  const codeHeader = document.createElement('div');
  codeHeader.className = 'demoCodeHeader';
  const codeTitle = document.createElement('span');
  codeTitle.textContent = 'Creation code';
  const copyCode = document.createElement('button');
  copyCode.type = 'button';
  copyCode.className = 'demoCopy';
  copyCode.textContent = 'Copy';
  const codeActions = document.createElement('span');
  codeActions.className = 'demoCodeActions';
  const codeBlock = document.createElement('pre');
  codeBlock.className = 'demoCode';
  const code = document.createElement('code');
  codeBlock.append(code);
  codeActions.append(reset, copyCode);
  codeHeader.append(codeTitle, codeActions);
  codeSection.append(codeHeader, codeBlock);
  body.append(view.fieldset, content.fieldset, controls.fieldset, codeSection);

  let optionRegion = '';
  let optionLocale = '';
  let markerSelectEnabled = false;
  const updateRegionOptions = (state: OEMWidgetState) => {
    if (optionRegion === state.regionId && optionLocale === state.locale) return;
    optionRegion = state.regionId;
    optionLocale = state.locale;
    const region = manifest.regions.find((entry) => entry.id === state.regionId)!;
    subregionSelect.replaceChildren(createOption('', 'Entire region'));
    for (const subregion of region.subregions) {
      const localized = subregion.locales?.[state.locale] ?? subregion.locales?.[manifest.fallbackLocale];
      subregionSelect.append(createOption(subregion.id, localized?.name ?? subregion.key));
    }
    floorSelect.replaceChildren();
    for (const floor of [...region.floors].sort((left, right) => FLOOR_ORDER.indexOf(left.id) - FLOOR_ORDER.indexOf(right.id))) {
      floorSelect.append(createOption(floor.id));
    }
    zoomInput.min = String(region.minZoom);
    zoomInput.max = String(region.maxZoom);
  };

  const sync = (state: OEMWidgetState, creation: DemoCreationConfig) => {
    updateRegionOptions(state);
    regionSelect.value = state.regionId;
    subregionSelect.value = state.subregionId ?? '';
    floorSelect.value = state.floorId;
    localeSelect.value = state.locale;
    themeSelect.value = creation.theme;
    if (document.activeElement !== zoomInput) zoomInput.value = String(state.zoom);
    zoomValue.value = state.zoom.toFixed(2);
    if (document.activeElement !== centerX) centerX.value = String(Math.round(state.center.x));
    if (document.activeElement !== centerY) centerY.value = String(Math.round(state.center.y));

    const selectedTypes = state.markerTypes === '*' ? [] : state.markerTypes;
    markerModes.get(state.markerTypes === '*' ? 'all' : selectedTypes.length ? 'selected' : 'none')!.checked = true;
    markerSelectEnabled = state.markerTypes !== '*' && selectedTypes.length > 0;
    markerSelect.disabled = !markerSelectEnabled;
    if (selectedTypes.length) setSelectedValues(markerSelect, selectedTypes);
    markerCount.value = state.markerTypes === '*' ? 'all' : String(selectedTypes.length);

    labels.input.checked = state.labels;
    boundaries.input.checked = state.boundaries;
    clustering.input.checked = state.markerClustering;
    regionSelector.input.checked = creation.showRegionSelector;
    floorSelector.input.checked = creation.showFloorSelector;
    scaleBar.input.checked = creation.showScaleBar;
    lockDrag.input.checked = creation.lockDrag;
    lockZoom.input.checked = creation.lockZoom;
    code.textContent = createWidgetCode(manifest, state, creation);
  };

  regionSelect.addEventListener('change', () => callbacks.update({ region: regionSelect.value as OEMRegionSelector }));
  subregionSelect.addEventListener('change', () => callbacks.update({ subregion: subregionSelect.value || null }));
  floorSelect.addEventListener('change', () => callbacks.update({ floor: floorSelect.value as OEMFloorId }));
  localeSelect.addEventListener('change', () => callbacks.update({ locale: localeSelect.value as OEMLocale }));
  themeSelect.addEventListener('change', () => callbacks.recreate({ theme: themeSelect.value as DemoCreationConfig['theme'] }));
  zoomInput.addEventListener('input', () => { zoomValue.value = Number(zoomInput.value).toFixed(2); });
  zoomInput.addEventListener('change', () => callbacks.update({ zoom: Number(zoomInput.value) }));
  const updateCenter = () => {
    const x = Number(centerX.value);
    const y = Number(centerY.value);
    if (Number.isFinite(x) && Number.isFinite(y)) callbacks.update({ center: { x, y } });
  };
  centerX.addEventListener('change', updateCenter);
  centerY.addEventListener('change', updateCenter);

  markerMode.addEventListener('change', () => {
    const mode = [...markerModes].find(([, input]) => input.checked)?.[0];
    if (mode === 'all') callbacks.update({ markerTypes: '*' });
    else if (mode === 'none') callbacks.update({ markerTypes: false });
    else {
      const selected = [...markerSelect.selectedOptions].map((option) => option.value);
      callbacks.update({ markerTypes: selected.length ? selected : initialMarkerTypes });
    }
  });
  markerSelect.addEventListener('change', () => {
    const selected = [...markerSelect.selectedOptions].map((option) => option.value);
    callbacks.update({ markerTypes: selected.length ? selected : false });
  });
  labels.input.addEventListener('change', () => callbacks.update({ labels: labels.input.checked }));
  boundaries.input.addEventListener('change', () => callbacks.update({ boundaries: boundaries.input.checked }));
  clustering.input.addEventListener('change', () => callbacks.update({ markerClustering: clustering.input.checked }));
  regionSelector.input.addEventListener('change', () => callbacks.recreate({ showRegionSelector: regionSelector.input.checked }));
  floorSelector.input.addEventListener('change', () => callbacks.recreate({ showFloorSelector: floorSelector.input.checked }));
  scaleBar.input.addEventListener('change', () => callbacks.recreate({ showScaleBar: scaleBar.input.checked }));
  lockDrag.input.addEventListener('change', () => callbacks.recreate({ lockDrag: lockDrag.input.checked }));
  lockZoom.input.addEventListener('change', () => callbacks.recreate({ lockZoom: lockZoom.input.checked }));
  reset.addEventListener('click', callbacks.reset);
  copyCode.addEventListener('click', () => {
    if (!navigator.clipboard?.writeText) {
      copyCode.textContent = 'Unavailable';
      window.setTimeout(() => { copyCode.textContent = 'Copy'; }, 1200);
      return;
    }
    void navigator.clipboard.writeText(code.textContent ?? '').then(() => {
      copyCode.textContent = 'Copied';
      window.setTimeout(() => { copyCode.textContent = 'Copy'; }, 1200);
    }).catch(() => {
      copyCode.textContent = 'Unavailable';
      window.setTimeout(() => { copyCode.textContent = 'Copy'; }, 1200);
    });
  });

  return {
    element,
    setBusy(busy) {
      element.classList.toggle('busy', busy);
      element.setAttribute('aria-busy', String(busy));
      for (const control of body.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')) {
        control.disabled = busy || (control === markerSelect && !markerSelectEnabled);
      }
    },
    sync,
  };
}
