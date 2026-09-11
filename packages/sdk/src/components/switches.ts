import { getOEMRegion } from '@opendfieldmap/core';
import type { OEMRegion, OEMSubregion } from '@opendfieldmap/core';
import { LAYER_ICON, REGION_ICONS } from '../icons';
import type { OEMFloorId, OEMRegionSelector, OEMWidgetState } from '../types';
import { createButton, getMessages, setLabel } from './types';
import type { Control, ControlContext } from './types';

const FLOOR_ORDER = ['L4', 'L3', 'L2', 'L1', 'M', 'B1', 'B2', 'B3', 'B4'];

/** Creates the nested, keyboard-operable action shape used by Atlos switch items. */
const createSwitchAction = (className: string): HTMLDivElement => {
  const element = document.createElement('div');
  element.className = className;
  element.tabIndex = 0;
  element.setAttribute('role', 'button');
  return element;
};

/** Keeps touch and keyboard flyouts exclusive without affecting pointer hover. */
const bindPersistentPanel = (owner: HTMLElement, context: ControlContext): void => {
  owner.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse') context.panels.collapseAll();
  });
  owner.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') context.panels.expand(owner);
  });
  owner.addEventListener('focusin', () => {
    if (owner.matches(':focus-visible') || owner.querySelector(':focus-visible')) context.panels.expand(owner);
  });
  owner.addEventListener('focusout', (event) => {
    if (!(event.relatedTarget instanceof Node) || !owner.contains(event.relatedTarget)) context.panels.collapse(owner);
  });
};

/** Moves an Atlos indicator by transform so transitions stay on the compositor. */
const positionIndicator = (indicator: HTMLElement, target: HTMLElement): void => {
  const horizontal = indicator.closest('.horizontalSelectors') !== null;
  indicator.style.transform = horizontal
    ? `translateX(calc(${target.offsetLeft + target.offsetWidth / 2}px - 50%))`
    : `translateY(calc(${target.offsetTop + target.offsetHeight / 2}px - 50%))`;
};

/** Creates the RGN control and its hover/focus subregion rail. */
export const createRegionControl = (context: ControlContext): Control & { element: HTMLElement } => {
  const { manifest, apply } = context;
  const element = document.createElement('div');
  element.className = 'switch regionSwitch';
  const label = document.createElement('div');
  label.className = 'switchLabel regionLabel';
  label.setAttribute('aria-hidden', 'true');
  const indicator = document.createElement('div');
  indicator.className = 'switchIndicator';
  if (!context.horizontalSelectors) element.append(label);
  element.append(indicator);

  const controls = new Map<string, {
    region: OEMRegion;
    button: HTMLDivElement;
    subregions: Map<string, { data: OEMSubregion; button: HTMLButtonElement }>;
    subregionIndicator?: HTMLDivElement;
  }>();

  for (const region of manifest.regions) {
    const regionButton = createSwitchAction('switchItem regionEntry');
    regionButton.dataset.region = region.id;
    if (region.subregions.length > 1) bindPersistentPanel(regionButton, context);
    const icon = document.createElement('span');
    icon.className = 'switchIcon';
    const markup = REGION_ICONS[region.id];
    if (!markup) throw new Error(`Missing Atlos region icon: ${region.id}`);
    icon.innerHTML = markup;
    regionButton.append(icon);
    const selectRegion = () => {
      const target = region.initialView;
      apply({ region: region.id as OEMRegionSelector, subregion: null, floor: 'M', center: { x: target.x, z: target.z }, zoom: target.zoom });
    };
    regionButton.addEventListener('click', selectRegion);
    regionButton.addEventListener('keydown', (event) => {
      if (event.target !== regionButton) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectRegion();
    });
    const subregionControls = new Map<string, { data: OEMSubregion; button: HTMLButtonElement }>();
    let subregionIndicator: HTMLDivElement | undefined;
    if (region.subregions.length > 1) {
      const panel = document.createElement('div');
      panel.className = 'subregionPanel';
      panel.addEventListener('click', (event) => event.stopPropagation());
      const list = document.createElement('div');
      list.className = 'subregionList';
      subregionIndicator = document.createElement('div');
      subregionIndicator.className = 'switchIndicator';
      list.append(subregionIndicator);
      for (const subregion of region.subregions) {
        const subregionButton = createButton('selectionItem subregionItem');
        subregionButton.dataset.subregion = subregion.id;
        subregionButton.addEventListener('click', () => {
          context.panels.collapse(regionButton);
          const [[x1, y1], [x2, y2]] = subregion.bounds ?? [
            [region.initialView.x, region.initialView.z],
            [region.initialView.x, region.initialView.z],
          ];
          apply({
            region: region.id as OEMRegionSelector,
            subregion: subregion.id,
            floor: 'M',
            center: { x: (x1 + x2) / 2, z: (y1 + y2) / 2 },
            zoom: Math.max(region.minZoom, Math.min(region.maxZoom, 1)),
          });
        });
        subregionControls.set(subregion.id, { data: subregion, button: subregionButton });
        list.append(subregionButton);
      }
      panel.append(list);
      regionButton.append(panel);
    }
    controls.set(region.id, { region, button: regionButton, subregions: subregionControls, subregionIndicator });
    element.append(regionButton);
  }

  let stateKey = '';
  return {
    element,
    sync(state: OEMWidgetState) {
      const nextKey = `${state.locale}\0${state.regionId}\0${state.subregionId ?? ''}`;
      if (nextKey !== stateKey) {
        stateKey = nextKey;
        for (const [regionId, control] of controls) {
          const regionName = control.region.locales[state.locale] ?? control.region.locales[manifest.fallbackLocale] ?? control.region.name;
          control.button.classList.toggle('selected', regionId === state.regionId);
          setLabel(control.button, regionName);
          for (const [subregionId, subregion] of control.subregions) {
            const localized = subregion.data.locales?.[state.locale] ?? subregion.data.locales?.[manifest.fallbackLocale];
            subregion.button.textContent = localized?.short ?? subregion.data.key;
            setLabel(subregion.button, localized?.name ?? subregion.data.key);
            subregion.button.classList.toggle('selected', subregionId === state.subregionId);
          }
        }
      }
      for (const control of controls.values()) {
        const selectedSubregion = state.subregionId ? control.subregions.get(state.subregionId) : undefined;
        if (control.subregionIndicator) {
          control.subregionIndicator.classList.toggle('hidden', !selectedSubregion);
          if (selectedSubregion) positionIndicator(control.subregionIndicator, selectedSubregion.button);
        }
      }
      const selectedControl = controls.get(state.regionId);
      if (selectedControl) positionIndicator(indicator, selectedControl.button);
    },
  };
};

/** Creates the Atlos LYR control and its floor selection rail. */
export const createLayerControl = (context: ControlContext): Control & { element: HTMLElement } => {
  const { manifest, apply } = context;
  const element = document.createElement('div');
  element.className = 'switch layerSwitch';
  const label = document.createElement('div');
  label.className = 'switchLabel layerLabel';
  label.setAttribute('aria-hidden', 'true');
  const mainButton = createSwitchAction('switchItem');
  bindPersistentPanel(mainButton, context);
  const icon = document.createElement('span');
  icon.className = 'switchIcon';
  icon.innerHTML = LAYER_ICON;
  const panel = document.createElement('div');
  panel.className = 'floorPanel';
  panel.addEventListener('click', (event) => event.stopPropagation());
  const list = document.createElement('div');
  list.className = 'floorList';
  panel.append(list);
  mainButton.append(icon, panel);
  if (!context.horizontalSelectors) element.append(label);
  element.append(mainButton);
  mainButton.addEventListener('keydown', (event) => {
    if (event.target !== mainButton || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    mainButton.click();
  });
  const indicator = document.createElement('div');
  indicator.className = 'switchIndicator';
  const floorButtons = new Map<string, HTMLButtonElement>();
  let currentRegion = '';
  let currentLocale = '';
  let currentFloor = 'M';
  mainButton.addEventListener('click', () => {
    if (currentFloor !== 'M') apply({ floor: 'M' });
  });

  return {
    element,
    sync(state: OEMWidgetState) {
      const region = getOEMRegion(manifest, state.regionId);
      if (currentRegion !== region.id) {
        currentRegion = region.id;
        floorButtons.clear();
        list.replaceChildren(indicator);
        const floors = [...region.floors].sort((left, right) => FLOOR_ORDER.indexOf(left.id) - FLOOR_ORDER.indexOf(right.id));
        element.hidden = floors.length <= 1;
        for (const floor of floors) {
          const button = createButton('selectionItem floorItem');
          button.textContent = floor.id;
          button.addEventListener('click', () => {
            context.panels.collapse(mainButton);
            apply({ floor: floor.id as OEMFloorId });
          });
          floorButtons.set(floor.id, button);
          list.append(button);
        }
        currentLocale = '';
      }
      if (currentLocale !== state.locale) {
        currentLocale = state.locale;
        const messages = getMessages(manifest, state.locale);
        setLabel(mainButton, messages.layerSelect);
        for (const [floorId, button] of floorButtons) setLabel(button, `${messages.layerSelect}: ${floorId}`);
      }
      if (currentFloor !== state.floorId) floorButtons.get(currentFloor)?.classList.remove('selected');
      currentFloor = state.floorId;
      mainButton.classList.toggle('selected', currentFloor !== 'M');
      const selectedButton = floorButtons.get(currentFloor);
      selectedButton?.classList.add('selected');
      if (selectedButton) positionIndicator(indicator, selectedButton);
    },
  };
};
