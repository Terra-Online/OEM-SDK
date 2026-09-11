import type { OEMWidgetState } from '../types';
import { createScaleControl } from './scale';
import { createLayerControl, createRegionControl } from './switches';
import type { Control, ControlContext, Panels } from './types';

export const mountControls = (
  root: HTMLElement,
  visibility: { regionSelector: boolean; floorSelector: boolean; scaleBar: boolean; horizontalSelectors: boolean },
  context: Omit<ControlContext, 'panels' | 'horizontalSelectors'>,
): Control => {
  const hasSwitches = visibility.regionSelector || visibility.floorSelector;
  if (!hasSwitches && !visibility.scaleBar) return { sync: () => {} };

  const overlay = document.createElement('div');
  overlay.className = 'controlOverlay';
  root.append(overlay);
  const components: Control[] = [];
  let expandedPanel: HTMLElement | null = null;
  const panels: Panels = {
    expand(owner) {
      if (expandedPanel === owner) return;
      expandedPanel?.classList.remove('expanded');
      expandedPanel = owner;
      expandedPanel.classList.add('expanded');
    },
    collapse(owner) {
      owner.classList.remove('expanded');
      if (expandedPanel === owner) expandedPanel = null;
    },
    collapseAll() {
      expandedPanel?.classList.remove('expanded');
      expandedPanel = null;
    },
  };
  const controlContext: ControlContext = { ...context, panels, horizontalSelectors: visibility.horizontalSelectors };
  let currentState: OEMWidgetState | null = null;
  const handleOutsidePointer = (event: PointerEvent) => {
    if (expandedPanel && event.target instanceof Node && !expandedPanel.contains(event.target)) panels.collapseAll();
  };
  if (hasSwitches) document.addEventListener('pointerdown', handleOutsidePointer, true);
  const observer = !hasSwitches || typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    if (currentState) for (const component of components) component.sync(currentState);
  });
  observer?.observe(root);

  if (hasSwitches) {
    const switchArea = document.createElement('div');
    switchArea.className = 'switchArea';
    switchArea.classList.toggle('horizontalSelectors', visibility.horizontalSelectors);
    if (visibility.regionSelector) {
      const region = createRegionControl(controlContext);
      components.push(region);
      switchArea.append(region.element);
    }
    if (visibility.floorSelector) {
      const layer = createLayerControl(controlContext);
      components.push(layer);
      switchArea.append(layer.element);
    }
    overlay.append(switchArea);
  }

  if (visibility.scaleBar) {
    const scale = createScaleControl(controlContext);
    components.push(scale);
    overlay.append(scale.element);
  }

  return {
    sync(state: OEMWidgetState) {
      currentState = state;
      for (const component of components) component.sync(state);
    },
    destroy() {
      if (hasSwitches) document.removeEventListener('pointerdown', handleOutsidePointer, true);
      observer?.disconnect();
      panels.collapseAll();
      for (const component of components) component.destroy?.();
    },
  };
};
