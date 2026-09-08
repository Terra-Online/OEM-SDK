import { getOEMRegion } from '@opendfieldmap/core';
import type { OEMWidgetState } from '../types';
import { createButton, getMessages, setLabel } from './types';
import type { Control, ControlContext } from './types';

const ZOOM_STEP = 0.5;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

/** Creates the Atlos desktop click scale and compact touch-drag scale. */
export const createScaleControl = (context: ControlContext): Control & { element: HTMLElement } => {
  const { manifest, zoomLocked } = context;
  const element = document.createElement('div');
  element.className = 'scaleControl';
  element.classList.toggle('locked', zoomLocked);
  const decorationTop = document.createElement('div');
  decorationTop.className = 'scaleDecoration scaleDecorationTop';
  const decorationBottom = document.createElement('div');
  decorationBottom.className = 'scaleDecoration scaleDecorationBottom';
  const zoomInFrame = document.createElement('div');
  zoomInFrame.className = 'scaleFrame zoomInFrame';
  const zoomIn = createButton('zoomButton zoomIn');
  zoomIn.textContent = '+';
  zoomInFrame.append(zoomIn);
  const track = document.createElement('div');
  track.className = 'scaleTrack';
  const fill = document.createElement('div');
  fill.className = 'scaleFill';
  track.append(fill);
  const zoomOutFrame = document.createElement('div');
  zoomOutFrame.className = 'scaleFrame zoomOutFrame';
  const zoomOut = createButton('zoomButton zoomOut');
  zoomOut.textContent = '-';
  zoomOutFrame.append(zoomOut);
  element.append(decorationTop, zoomInFrame, track, zoomOutFrame, decorationBottom);

  let currentState: OEMWidgetState;
  let targetZoom: number | null = null;
  let scaleFrame: number | null = null;
  let zoomFrame: number | null = null;
  let dragPointerId: number | null = null;
  let dragStartY: number | null = null;
  let dragStartZoom: number | null = null;
  let currentLocale = '';

  const isCompact = () => (element.closest('.oemWidget')?.clientWidth ?? Number.POSITIVE_INFINITY) < 480;
  const scaleFor = (zoom: number, minimum: number, maximum: number) =>
    maximum === minimum ? 0 : clamp((zoom - minimum) / (maximum - minimum), 0, 1);
  const updateScale = (zoom: number, minimum: number, maximum: number) => {
    if (scaleFrame !== null) cancelAnimationFrame(scaleFrame);
    scaleFrame = requestAnimationFrame(() => {
      track.style.setProperty('--scale', String(scaleFor(zoom, minimum, maximum)));
      scaleFrame = null;
    });
  };
  const applyZoom = (zoom: number, animate: boolean) => {
    const region = getOEMRegion(manifest, currentState.regionId);
    const nextZoom = clamp(zoom, region.minZoom, region.maxZoom);
    if (targetZoom === nextZoom) return;
    targetZoom = nextZoom;
    updateScale(nextZoom, region.minZoom, region.maxZoom);
    context.zoomTo(nextZoom, { animate });
  };
  const scheduleDragZoom = (zoom: number) => {
    targetZoom = zoom;
    if (zoomFrame !== null) return;
    zoomFrame = requestAnimationFrame(() => {
      zoomFrame = null;
      if (targetZoom !== null) context.zoomTo(targetZoom, { animate: false });
    });
  };

  zoomIn.addEventListener('click', () => {
    if (!zoomLocked) applyZoom((targetZoom ?? currentState.zoom) + ZOOM_STEP, true);
  });
  zoomOut.addEventListener('click', () => {
    if (!zoomLocked) applyZoom((targetZoom ?? currentState.zoom) - ZOOM_STEP, true);
  });
  track.addEventListener('click', (event) => {
    if (zoomLocked || isCompact()) return;
    const region = getOEMRegion(manifest, currentState.regionId);
    const bounds = track.getBoundingClientRect();
    const ratio = 1 - (event.clientY - bounds.top) / bounds.height;
    applyZoom(region.minZoom + clamp(ratio, 0, 1) * (region.maxZoom - region.minZoom), true);
  });
  track.addEventListener('pointerdown', (event) => {
    if (zoomLocked || !isCompact()) return;
    event.preventDefault();
    event.stopPropagation();
    track.setPointerCapture(event.pointerId);
    dragPointerId = event.pointerId;
    dragStartY = event.clientY;
    dragStartZoom = targetZoom ?? currentState.zoom;
    element.classList.add('dragging');
  });
  track.addEventListener('pointermove', (event) => {
    if (dragPointerId !== event.pointerId || dragStartY === null || dragStartZoom === null) return;
    event.preventDefault();
    const region = getOEMRegion(manifest, currentState.regionId);
    const delta = ((dragStartY - event.clientY) / Math.max(1, track.getBoundingClientRect().height)) *
      (region.maxZoom - region.minZoom);
    const nextZoom = clamp(dragStartZoom + delta, region.minZoom, region.maxZoom);
    updateScale(nextZoom, region.minZoom, region.maxZoom);
    scheduleDragZoom(nextZoom);
  });
  const finishDrag = (event: PointerEvent) => {
    if (dragPointerId !== event.pointerId) return;
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    dragPointerId = null;
    dragStartY = null;
    dragStartZoom = null;
    element.classList.remove('dragging');
  };
  track.addEventListener('pointerup', finishDrag);
  track.addEventListener('pointercancel', finishDrag);
  track.addEventListener('lostpointercapture', finishDrag);

  return {
    element,
    sync(state: OEMWidgetState) {
      currentState = state;
      targetZoom = state.zoom;
      const region = getOEMRegion(manifest, state.regionId);
      updateScale(state.zoom, region.minZoom, region.maxZoom);
      if (currentLocale !== state.locale) {
        currentLocale = state.locale;
        const messages = getMessages(manifest, state.locale);
        setLabel(zoomIn, messages.zoomIn);
        setLabel(zoomOut, messages.zoomOut);
      }
      zoomIn.disabled = zoomLocked || state.zoom >= region.maxZoom;
      zoomOut.disabled = zoomLocked || state.zoom <= region.minZoom;
    },
    destroy() {
      if (scaleFrame !== null) cancelAnimationFrame(scaleFrame);
      if (zoomFrame !== null) cancelAnimationFrame(zoomFrame);
      element.classList.remove('dragging');
    },
  };
};
