import type { OEMManifest, OEMPointType } from '@opendfieldmap/core';
import type { OEMBoundarySource, OEMCustomPoint, OEMFloorId, OEMLocale, OEMRegionSelector, OEMWidgetConfig, OEMWidgetState } from '@opendfieldmap/sdk';

const FLOOR_ORDER = ['L4', 'L3', 'L2', 'L1', 'M', 'B1', 'B2', 'B3', 'B4'];
const REGION_CODES: Readonly<Record<string, string>> = Object.freeze({
  Valley_4: 'VL',
  Wuling: 'WL',
  Dijiang: 'DJ',
  Weekraid_1: 'ES',
});

/** Creation-only Widget options exposed by the interactive Demo. */
export interface DemoCreationConfig {
  showRegionSelector: boolean;
  showFloorSelector: boolean;
  showScaleBar: boolean;
  lockDrag: boolean;
  lockZoom: boolean;
  theme: 'light' | 'dark';
}

/** A map release offered by the Demo's optional version selector. */
export interface DemoVersionOption {
  id: string;
  label: string;
  manifestPath: string;
}

interface DemoConfigPanelCallbacks {
  update(config: OEMWidgetConfig): void;
  recreate(config: Partial<DemoCreationConfig>): void;
  selectVersion?(id: string): void;
  reset(): void;
}

/** Host-side controller used to keep the Demo form synchronized with the Widget. */
export interface DemoConfigPanel {
  element: HTMLDetailsElement;
  setBusy(busy: boolean): void;
  sync(state: OEMWidgetState, creation: DemoCreationConfig, customPoints: readonly OEMCustomPoint[], customPointsUrl?: string): void;
  destroy(): void;
}

const createOption = (value: string, label = value): HTMLOptionElement => {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
};

const createSelect = (label: string): HTMLSelectElement => {
  const select = document.createElement('select');
  select.autocomplete = 'off';
  select.setAttribute('aria-label', label);
  return select;
};

const createField = (label: string, control: HTMLElement, full = false): HTMLLabelElement => {
  const field = document.createElement('label');
  field.className = `demoField${full ? ' full' : ''}`;
  const caption = document.createElement('span');
  caption.className = 'demoFieldLabel';
  caption.textContent = label;
  if (control instanceof HTMLSelectElement) {
    const selectControl = document.createElement('span');
    selectControl.className = 'demoSelectControl';
    const disclosure = document.createElement('span');
    disclosure.className = 'demoSelectDisclosure';
    disclosure.setAttribute('aria-hidden', 'true');
    selectControl.append(control, disclosure);
    field.append(caption, selectControl);
  } else {
    field.append(caption, control);
  }
  return field;
};

const createToggle = (label: string): { field: HTMLLabelElement; input: HTMLInputElement } => {
  const field = document.createElement('label');
  field.className = 'demoToggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.autocomplete = 'off';
  const text = document.createElement('span');
  text.textContent = label;
  field.append(input, text);
  return { field, input };
};

interface DemoNumberControl {
  element: HTMLSpanElement;
  input: HTMLInputElement;
  scrubber: HTMLSpanElement;
}

const createNumberControl = (prefix: string, label: string): DemoNumberControl => {
  const element = document.createElement('span');
  element.className = 'demoNumberControl';
  const scrubber = document.createElement('span');
  scrubber.className = 'demoNumberPrefix';
  scrubber.textContent = prefix;
  scrubber.setAttribute('aria-hidden', 'true');
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '1';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', label);
  element.append(scrubber, input);
  return { element, input, scrubber };
};

/** Adds Figma-style horizontal scrubbing to a number field's prefix. */
const bindNumberScrubber = (control: DemoNumberControl, commit: () => void): (() => void) => {
  let pointerId: number | null = null;
  let startX = 0;
  let startValue = 0;
  let changed = false;

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || control.input.disabled) return;
    event.preventDefault();
    pointerId = event.pointerId;
    startX = event.clientX;
    startValue = Number(control.input.value) || 0;
    changed = false;
    control.scrubber.setPointerCapture(event.pointerId);
    control.element.classList.add('scrubbing');
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    const multiplier = event.shiftKey ? 10 : 1;
    const value = Math.round(startValue + (event.clientX - startX) * multiplier);
    changed ||= value !== Number(control.input.value);
    control.input.value = String(value);
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    control.element.classList.remove('scrubbing');
    if (changed) commit();
  };
  control.scrubber.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);
  return () => {
    control.scrubber.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerEnd);
    window.removeEventListener('pointercancel', onPointerEnd);
  };
};

let nextPanelZIndex = 1800;

export const bindPanelDragging = (element: HTMLDetailsElement, handle: HTMLElement): (() => void) => {
  const margin = 16;
  const bottomMargin = 32;
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let moved = false;
  let suppressClick = false;

  const bringToFront = (): void => {
    element.style.zIndex = String(++nextPanelZIndex);
  };

  const place = (left: number, top: number): void => {
    const rect = element.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - margin - rect.width);
    // The body max-height follows the top offset, so the header is the stable
    // minimum height used to clamp the panel while it contracts downward.
    const maxTop = Math.max(margin, window.innerHeight - bottomMargin - handle.getBoundingClientRect().height);
    const nextLeft = Math.min(Math.max(margin, left), maxLeft);
    const nextTop = Math.min(Math.max(margin, top), maxTop);
    element.style.left = `${nextLeft}px`;
    element.style.top = `${nextTop}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
    element.style.setProperty('--demoPanelTop', `${nextTop}px`);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || element.classList.contains('busy')) return;
    bringToFront();
    const rect = element.getBoundingClientRect();
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    moved = false;
    place(startLeft, startTop);
    element.classList.add('dragging');
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!moved && Math.hypot(deltaX, deltaY) < 4) return;
    moved = true;
    place(startLeft + deltaX, startTop + deltaY);
    event.preventDefault();
  };

  const onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    element.classList.remove('dragging');
    if (moved) suppressClick = true;
    if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture?.(event.pointerId);
  };

  const onClick = (event: MouseEvent): void => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onResize = (): void => {
    if (element.style.left) {
      const rect = element.getBoundingClientRect();
      place(rect.left, rect.top);
    }
  };

  handle.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointerdown', bringToFront);
  element.addEventListener('focusin', bringToFront);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);
  handle.addEventListener('click', onClick);
  window.addEventListener('resize', onResize);
  return () => {
    handle.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointerdown', bringToFront);
    element.removeEventListener('focusin', bringToFront);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerEnd);
    window.removeEventListener('pointercancel', onPointerEnd);
    handle.removeEventListener('click', onClick);
    window.removeEventListener('resize', onResize);
  };
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

const quote = (value: string): string => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

/** Produces a reproducible snippet while omitting options still at SDK defaults. */
const createWidgetCode = (
  manifest: OEMManifest,
  state: OEMWidgetState,
  creation: DemoCreationConfig,
  customPoints: readonly OEMCustomPoint[],
  customPointsUrl?: string,
  version?: DemoVersionOption,
): string => {
  const region = manifest.regions.find((entry) => entry.id === state.regionId)!;
  const subregion = state.subregionId
    ? region.subregions.find((entry) => entry.id === state.subregionId)
    : undefined;
  const presetCenter = subregion?.bounds
    ? {
        x: (subregion.bounds[0][0] + subregion.bounds[1][0]) / 2,
        z: (subregion.bounds[0][1] + subregion.bounds[1][1]) / 2,
      }
    : region.initialView;
  const presetZoom = subregion ? Math.max(region.minZoom, Math.min(region.maxZoom, 1)) : region.initialView.zoom;
  const lines = [
    `  region: ${quote(REGION_CODES[state.regionId] ?? state.regionId)},`,
    `  locale: ${quote(state.locale)},`,
  ];
  if (version?.manifestPath !== undefined && version.manifestPath !== '/channels/stable.json') {
    lines.unshift(
      '  resources: {',
      "    baseUrl: 'https://data.opendfieldmap.org',",
      `    manifestPath: ${quote(version.manifestPath)},`,
      '  },',
    );
  }
  if (state.subregionId) lines.push(`  subregion: ${quote(state.subregionId)},`);
  if (state.floorId !== 'M') lines.push(`  floor: ${quote(state.floorId)},`);
  if (state.markerTypes === '*') lines.push("  markerTypes: '*',");
  else if (state.markerTypes.length) lines.push(`  markerTypes: [${state.markerTypes.map(quote).join(', ')}],`);
  if (!state.labels) lines.push('  labels: false,');
  if (state.boundaries) {
    lines.push('  boundaries: true,');
    if (state.boundarySource !== 'oem') lines.push(`  boundarySource: ${quote(state.boundarySource)},`);
  }
  if (!state.markerClustering) lines.push('  markerClustering: false,');
  const regionCustomPoints = customPoints.filter((point) => point.position.regionId === state.regionId);
  if (customPointsUrl && regionCustomPoints.length) {
    lines.push(`  customPointsUrl: ${quote(new URL(customPointsUrl, window.location.href).pathname)},`);
  } else if (regionCustomPoints.length) {
    const serialized = JSON.stringify(regionCustomPoints, null, 2).split('\n');
    lines.push(`  customPoints: ${serialized[0]}`);
    lines.push(...serialized.slice(1).map((line) => `  ${line}`));
    lines[lines.length - 1] += ',';
  }
  if (Math.abs(state.zoom - presetZoom) > 0.001) lines.push(`  zoom: ${Number(state.zoom.toFixed(2))},`);
  if (Math.abs(state.center.x - presetCenter.x) > 0.5 || Math.abs(state.center.z - presetCenter.z) > 0.5) {
    lines.push(`  center: { x: ${Math.round(state.center.x)}, z: ${Math.round(state.center.z)} },`);
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
  versions?: { selected: string; options: readonly DemoVersionOption[] },
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
  disclosure.textContent = '✦';
  disclosure.setAttribute('aria-hidden', 'true');
  const title = document.createElement('span');
  title.className = 'demoPanelTitle';
  title.textContent = 'Widget Config';
  heading.append(disclosure, title);
  summaryRow.append(heading);
  summary.append(summaryRow);
  summary.setAttribute('aria-expanded', String(element.open));

  const body = document.createElement('div');
  body.className = 'demoPanelBody';
  element.append(summary, body);
  element.classList.toggle('expanded', element.open);
  const destroyPanelDragging = bindPanelDragging(element, summary);

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
  let versionSelect: HTMLSelectElement | undefined;
  if (versions) {
    versionSelect = createSelect('Version');
    for (const version of versions.options) versionSelect.append(createOption(version.id, version.label));
    versionSelect.value = versions.selected;
  }

  const zoomWrap = document.createElement('span');
  zoomWrap.className = 'demoRange';
  const zoomTrack = document.createElement('span');
  zoomTrack.className = 'demoRangeTrack';
  const zoomInput = document.createElement('input');
  zoomInput.type = 'range';
  zoomInput.step = '0.05';
  zoomInput.autocomplete = 'off';
  zoomInput.setAttribute('aria-label', 'Zoom');
  const zoomThumb = document.createElement('span');
  zoomThumb.className = 'demoRangeThumb';
  zoomThumb.setAttribute('aria-hidden', 'true');
  zoomTrack.append(zoomInput, zoomThumb);
  const zoomValue = document.createElement('output');
  zoomWrap.append(zoomTrack, zoomValue);
  const center = document.createElement('span');
  center.className = 'demoCoordinatePair';
  const centerXControl = createNumberControl('X', 'Center X');
  const centerZControl = createNumberControl('Z', 'Center Z');
  const centerX = centerXControl.input;
  const centerZ = centerZControl.input;
  center.append(centerXControl.element, centerZControl.element);

  const view = createSection('View');
  view.fieldset.classList.add('demoViewSection');
  view.content.append(
    createField('Region', regionSelect),
    createField('Subregion', subregionSelect),
    createField('Floor', floorSelect),
    createField('Language', localeSelect),
    createField('Theme', themeSelect),
    ...(versionSelect ? [createField('Version', versionSelect)] : []),
    createField('Zoom', zoomWrap, true),
    createField('Center', center, true),
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
    input.autocomplete = 'off';
    const text = document.createElement('span');
    text.textContent = label;
    segment.append(input, text);
    markerMode.append(segment);
    markerModes.set(value, input);
  }
  const markerPicker = document.createElement('div');
  markerPicker.className = 'demoMarkerPicker';
  const markerTrigger = document.createElement('button');
  markerTrigger.type = 'button';
  markerTrigger.className = 'demoMarkerTrigger';
  markerTrigger.setAttribute('aria-expanded', 'false');
  markerTrigger.setAttribute('aria-haspopup', 'listbox');
  const markerSelection = document.createElement('span');
  markerSelection.className = 'demoMarkerSelection';
  const markerDisclosure = document.createElement('span');
  markerDisclosure.className = 'demoMarkerDisclosure';
  markerDisclosure.setAttribute('aria-hidden', 'true');
  markerTrigger.append(markerSelection, markerDisclosure);
  const markerMenu = document.createElement('div');
  markerMenu.className = 'demoMarkerMenu';
  const markerSearch = document.createElement('input');
  markerSearch.type = 'search';
  markerSearch.className = 'demoMarkerSearch';
  markerSearch.placeholder = 'Filter marker types';
  markerSearch.autocomplete = 'off';
  markerSearch.setAttribute('aria-label', 'Filter marker types');
  const markerOptions = document.createElement('div');
  markerOptions.className = 'demoMarkerOptions';
  markerOptions.setAttribute('role', 'listbox');
  markerOptions.setAttribute('aria-multiselectable', 'true');
  const markerInputs = new Map<string, HTMLInputElement>();
  for (const key of Object.keys(pointTypes).sort()) {
    const option = document.createElement('label');
    option.className = 'demoMarkerOption';
    option.setAttribute('role', 'option');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = key;
    input.autocomplete = 'off';
    const text = document.createElement('span');
    text.textContent = key;
    option.append(input, text);
    markerOptions.append(option);
    markerInputs.set(key, input);
  }
  markerMenu.append(markerSearch, markerOptions);
  markerPicker.append(markerTrigger, markerMenu);
  const markerField = createField('Marker types', markerPicker, true);

  const labels = createToggle('Place names');
  labels.field.classList.add('demoPlaceNamesField');
  const boundaries = createToggle('Boundaries');
  boundaries.field.classList.add('demoBoundariesToggle');
  const boundarySource = document.createElement('div');
  boundarySource.className = 'demoSegments demoBoundarySourceChoices';
  boundarySource.setAttribute('role', 'radiogroup');
  boundarySource.setAttribute('aria-label', 'Boundary source');
  const boundarySources = new Map<string, HTMLInputElement>();
  for (const [value, label] of [['oem', 'OEM'], ['game', 'Game']]) {
    const segment = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'demoBoundarySource';
    input.value = value;
    input.autocomplete = 'off';
    const text = document.createElement('span');
    text.textContent = label;
    segment.append(input, text);
    boundarySource.append(segment);
    boundarySources.set(value, input);
  }
  const boundaryControls = document.createElement('div');
  boundaryControls.className = 'demoBoundaryControls full';
  boundaryControls.append(boundaries.field, boundarySource);
  const clustering = createToggle('Clustering');
  clustering.field.classList.add('demoClusteringField');
  const content = createSection('Content');
  content.fieldset.classList.add('demoContentSection');
  content.content.append(createField('Marker data', markerMode, true), markerField, labels.field, clustering.field,
    boundaryControls);

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
  reset.setAttribute('aria-label', 'Reset widget configuration');
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
  copyCode.setAttribute('aria-label', 'Copy creation code');
  copyCode.textContent = 'Copy';
  const codeActions = document.createElement('span');
  codeActions.className = 'demoCodeActions';
  const code = document.createElement('textarea');
  code.className = 'demoCode';
  code.readOnly = true;
  code.wrap = 'off';
  code.spellcheck = false;
  code.setAttribute('aria-label', 'Creation code');
  codeActions.append(reset, copyCode);
  codeHeader.append(codeTitle, codeActions);
  codeSection.append(codeHeader, code);
  body.append(view.fieldset, content.fieldset, controls.fieldset, codeSection);

  let optionRegion = '';
  let optionLocale = '';
  let markerPickerEnabled = false;
  const closeMarkerPicker = () => {
    markerPicker.classList.remove('open');
    markerTrigger.setAttribute('aria-expanded', 'false');
  };
  const setMarkerPickerOpen = (open: boolean) => {
    if (!markerPickerEnabled) return;
    markerPicker.classList.toggle('open', open);
    markerTrigger.setAttribute('aria-expanded', String(open));
    if (open) markerSearch.focus();
  };
  const selectedMarkerTypes = () => [...markerInputs]
    .filter(([, input]) => input.checked)
    .map(([key]) => key);
  const syncMarkerPicker = (selected: readonly string[]) => {
    const selectedSet = new Set(selected);
    for (const [key, input] of markerInputs) input.checked = selectedSet.has(key);
    markerSelection.textContent = selected.length === 1 ? '1 type selected' : `${selected.length} types selected`;
  };
  const filterMarkerOptions = () => {
    const query = markerSearch.value.trim().toLocaleLowerCase();
    for (const [key, input] of markerInputs) {
      input.parentElement!.hidden = Boolean(query) && !key.toLocaleLowerCase().includes(query);
    }
  };
  const onDocumentPointerDown = (event: PointerEvent) => {
    if (!markerPicker.contains(event.target as Node)) closeMarkerPicker();
  };
  document.addEventListener('pointerdown', onDocumentPointerDown);

  let zoomFrame: number | null = null;
  let renderedZoomProgress: number | null = null;
  let targetZoomProgress = 0;
  let zoomDisplayInitialized = false;
  const renderZoomProgress = () => {
    zoomFrame = null;
    if (renderedZoomProgress === null) renderedZoomProgress = targetZoomProgress;
    const delta = targetZoomProgress - renderedZoomProgress;
    renderedZoomProgress += delta * 0.24;
    if (Math.abs(delta) < 0.001) renderedZoomProgress = targetZoomProgress;
    zoomTrack.style.setProperty('--demoRangeProgress', `${renderedZoomProgress * 100}%`);
    zoomThumb.style.left = `${renderedZoomProgress * 100}%`;
    if (renderedZoomProgress !== targetZoomProgress) zoomFrame = requestAnimationFrame(renderZoomProgress);
  };
  const updateZoomDisplay = (immediate = false) => {
    const minimum = Number(zoomInput.min);
    const maximum = Number(zoomInput.max);
    const value = Number(zoomInput.value);
    const progress = maximum > minimum ? (value - minimum) / (maximum - minimum) : 0;
    targetZoomProgress = Math.min(1, Math.max(0, progress));
    zoomValue.value = value.toFixed(2);
    if (immediate) {
      if (zoomFrame !== null) cancelAnimationFrame(zoomFrame);
      zoomFrame = null;
      renderedZoomProgress = targetZoomProgress;
      renderZoomProgress();
    } else if (zoomFrame === null) {
      zoomFrame = requestAnimationFrame(renderZoomProgress);
    }
  };
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

  const sync = (state: OEMWidgetState, creation: DemoCreationConfig, customPoints: readonly OEMCustomPoint[], customPointsUrl?: string) => {
    const previousRegion = optionRegion;
    updateRegionOptions(state);
    regionSelect.value = state.regionId;
    subregionSelect.value = state.subregionId ?? '';
    floorSelect.value = state.floorId;
    localeSelect.value = state.locale;
    themeSelect.value = creation.theme;
    if (versionSelect && versions) versionSelect.value = versions.selected;
    if (document.activeElement !== zoomInput) zoomInput.value = String(state.zoom);
    updateZoomDisplay(!zoomDisplayInitialized || previousRegion !== state.regionId);
    zoomDisplayInitialized = true;
    if (document.activeElement !== centerX) centerX.value = String(Math.round(state.center.x));
    if (document.activeElement !== centerZ) centerZ.value = String(Math.round(state.center.z));

    const selectedTypes = state.markerTypes === '*' ? [] : state.markerTypes;
    markerModes.get(state.markerTypes === '*' ? 'all' : selectedTypes.length ? 'selected' : 'none')!.checked = true;
    markerPickerEnabled = state.markerTypes !== '*' && selectedTypes.length > 0;
    markerPicker.classList.toggle('disabled', !markerPickerEnabled);
    markerTrigger.disabled = !markerPickerEnabled;
    if (!markerPickerEnabled) closeMarkerPicker();
    if (selectedTypes.length) syncMarkerPicker(selectedTypes);
    else markerSelection.textContent = state.markerTypes === '*' ? 'All types' : 'No types selected';

    labels.input.checked = state.labels;
    boundaries.input.checked = state.boundaries;
    boundarySources.get(state.boundarySource)!.checked = true;
    boundarySource.classList.toggle('disabled', !state.boundaries);
    boundarySource.setAttribute('aria-disabled', String(!state.boundaries));
    for (const input of boundarySources.values()) input.disabled = !state.boundaries || element.classList.contains('busy');
    clustering.input.checked = state.markerClustering;
    regionSelector.input.checked = creation.showRegionSelector;
    floorSelector.input.checked = creation.showFloorSelector;
    scaleBar.input.checked = creation.showScaleBar;
    lockDrag.input.checked = creation.lockDrag;
    lockZoom.input.checked = creation.lockZoom;
    const selectedVersion = versions?.options.find((version) => version.id === versions.selected);
    code.value = createWidgetCode(manifest, state, creation, customPoints, customPointsUrl, selectedVersion);
  };

  regionSelect.addEventListener('change', () => callbacks.update({ region: regionSelect.value as OEMRegionSelector }));
  subregionSelect.addEventListener('change', () => callbacks.update({ subregion: subregionSelect.value || null }));
  floorSelect.addEventListener('change', () => callbacks.update({ floor: floorSelect.value as OEMFloorId }));
  localeSelect.addEventListener('change', () => callbacks.update({ locale: localeSelect.value as OEMLocale }));
  boundarySource.addEventListener('change', () => {
    if (!boundaries.input.checked) return;
    const value = [...boundarySources].find(([, input]) => input.checked)?.[0];
    if (value) callbacks.update({ boundarySource: value as OEMBoundarySource });
  });
  themeSelect.addEventListener('change', () => callbacks.recreate({ theme: themeSelect.value as DemoCreationConfig['theme'] }));
  versionSelect?.addEventListener('change', () => callbacks.selectVersion?.(versionSelect.value));
  zoomInput.addEventListener('input', () => updateZoomDisplay());
  zoomInput.addEventListener('change', () => callbacks.update({ zoom: Number(zoomInput.value) }));
  const updateCenter = () => {
    const x = Number(centerX.value);
    const z = Number(centerZ.value);
    if (Number.isFinite(x) && Number.isFinite(z)) callbacks.update({ center: { x, z } });
  };
  centerX.addEventListener('change', updateCenter);
  centerZ.addEventListener('change', updateCenter);
  const destroyScrubbers = [
    bindNumberScrubber(centerXControl, updateCenter),
    bindNumberScrubber(centerZControl, updateCenter),
  ];

  markerMode.addEventListener('change', () => {
    const mode = [...markerModes].find(([, input]) => input.checked)?.[0];
    if (mode === 'all') callbacks.update({ markerTypes: '*' });
    else if (mode === 'none') callbacks.update({ markerTypes: false });
    else {
      const selected = selectedMarkerTypes();
      callbacks.update({ markerTypes: selected.length ? selected : initialMarkerTypes });
    }
  });
  markerTrigger.addEventListener('click', () => setMarkerPickerOpen(!markerPicker.classList.contains('open')));
  markerSearch.addEventListener('input', filterMarkerOptions);
  markerSearch.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMarkerPicker();
      markerTrigger.focus();
    }
  });
  markerOptions.addEventListener('change', () => {
    const selected = selectedMarkerTypes();
    markerSelection.textContent = selected.length === 1 ? '1 type selected' : `${selected.length} types selected`;
    callbacks.update({ markerTypes: selected.length ? selected : false });
  });
  labels.input.addEventListener('change', () => callbacks.update({ labels: labels.input.checked }));
  boundaries.input.addEventListener('change', () => {
    const enabled = boundaries.input.checked;
    boundarySource.classList.toggle('disabled', !enabled);
    boundarySource.setAttribute('aria-disabled', String(!enabled));
    for (const input of boundarySources.values()) input.disabled = !enabled;
    callbacks.update({ boundaries: enabled });
  });
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
    void navigator.clipboard.writeText(code.value).then(() => {
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
        control.disabled = busy ||
          (boundarySource.contains(control) && !boundaries.input.checked) ||
          ((control === markerTrigger || markerInputs.has(control.value)) && !markerPickerEnabled);
      }
    },
    sync,
    destroy() {
      panelAnimation?.cancel();
      if (zoomFrame !== null) cancelAnimationFrame(zoomFrame);
      destroyPanelDragging();
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      for (const destroy of destroyScrubbers) destroy();
    },
  };
}
