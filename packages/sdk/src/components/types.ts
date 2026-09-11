import type { OEMControlMessages, OEMManifest } from '@opendfieldmap/core';
import type { OEMWidgetConfig, OEMWidgetState } from '../types';

/** Lifecycle contract shared by built-in controls. */
export interface Control {
  sync(state: OEMWidgetState): void;
  destroy?(): void;
}

/** Coordinates the one persistent flyout allowed across all switch controls. */
export interface Panels {
  expand(owner: HTMLElement): void;
  collapse(owner: HTMLElement): void;
  collapseAll(): void;
}

/** Dependencies supplied by the Widget coordinator to built-in controls. */
export interface ControlContext {
  manifest: OEMManifest;
  zoomLocked: boolean;
  horizontalSelectors: boolean;
  apply(update: OEMWidgetConfig): void;
  zoomTo(zoom: number, options: { animate: boolean }): void;
  panels: Panels;
}

/** Creates a reset, keyboard-accessible button for a control component. */
export const createButton = (className: string): HTMLButtonElement => {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  return element;
};

/** Applies a localized accessible name to a control without embedding UI copy. */
export const setLabel = (
  element: HTMLElement,
  label: string,
): void => {
  element.title = label;
  element.setAttribute('aria-label', label);
};

/** Resolves a control message bundle through the manifest locale fallback. */
export const getMessages = (
  manifest: OEMManifest,
  locale: string,
): OEMControlMessages => {
  const messages =
    manifest.controls[locale] ?? manifest.controls[manifest.fallbackLocale];
  if (!messages) throw new Error('Missing OEM control messages');
  return messages;
};
