// @vitest-environment jsdom
import L from 'leaflet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewportMarker } from '../packages/map/src/atlos/canvas/markerViewport';
import { canvasSurface } from '../packages/map/src/atlos/canvas/canvasMarkerSurface';
import { canvasPadding } from '../packages/map/src/atlos/canvas/canvasViewport';

let map: L.Map;
let host: HTMLDivElement;
let removed: boolean;
beforeEach(() => {
  removed = false;
  host = document.createElement('div');
  document.body.append(host);
  Object.defineProperties(host, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
  map = L.map(host, { crs: L.CRS.Simple, zoomAnimation: false }).setView([0, 0], 2);
});
afterEach(() => {
  if (!removed) map.remove();
  host.remove();
  vi.restoreAllMocks();
});
const marker = (position: L.LatLngExpression) =>
  new ViewportMarker(position, {
    icon: L.divIcon({
      className: 'incompleteMarker',
      html: '<span class="markerInner">point</span>',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    }),
  });
describe('Canvas marker lifecycle', () => {
  it('consumes scheduled frames without cancelling them and coalesces synchronous camera draws', () => {
    const pending = new Map<number, FrameRequestCallback>();
    let sequence = 0;
    const cancel = vi.fn((id: number) => {
      pending.delete(id);
    });
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      pending.set(++sequence, callback);
      return sequence;
    });
    vi.stubGlobal('cancelAnimationFrame', cancel);
    try {
      const point = marker([0, 0]).addTo(map);
      expect(pending.size).toBe(1);
      const [id, callback] = [...pending][0];
      pending.delete(id);
      callback(performance.now());
      expect(cancel).not.toHaveBeenCalled();
      // Initial state reconciliation may schedule the next animation frame.
      expect(pending.size).toBe(1);
      const [nextId, nextCallback] = [...pending][0];
      clock.mockReturnValue(2000);
      pending.delete(nextId);
      nextCallback(performance.now());
      expect(cancel).not.toHaveBeenCalled();
      expect(pending.size).toBe(0);
      point.setLatLng([1, 1]);
      const queued = sequence;
      expect(pending.size).toBe(1);
      map.fire('move');
      expect(cancel).toHaveBeenCalledExactlyOnceWith(queued);
      expect(pending.size).toBe(0);
    } finally {
      clock.mockRestore();
      vi.unstubAllGlobals();
    }
  });
  it.each([1, 1.25, 1.5, 1.75, 2])(
    'uses a 2x backing store at DPR %s without scaling CSS coordinates',
    (ratio) => {
      vi.stubGlobal('devicePixelRatio', ratio);
      try {
        marker([0, 0]).addTo(map);
        map.fire('move');
        const canvas = host.querySelector<HTMLCanvasElement>('.oem-canvas-markers')!;
        // Camera padding may enlarge the surface, while output density and its memory budget stay fixed.
        expect(canvas.width).toBeGreaterThanOrEqual(1600);
        expect(canvas.height).toBeGreaterThanOrEqual(1200);
        expect(canvas.width * canvas.height).toBeLessThanOrEqual(800 * 600 * 4 * 1.5);
        expect([parseFloat(canvas.style.width), parseFloat(canvas.style.height)]).toEqual([
          canvas.width / 2,
          canvas.height / 2,
        ]);
        expect(map.latLngToContainerPoint([0, 0])).toEqual(L.point(400, 300));
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
  it('refreshes physical resolution after a display change without replacing markers', () => {
    let changed: (() => void) | undefined;
    const remove = vi.fn();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        addEventListener: (_: string, fn: () => void) => {
          changed = fn;
        },
        removeEventListener: remove,
      })),
    );
    vi.stubGlobal('devicePixelRatio', 1.25);
    try {
      const point = marker([0, 0]).addTo(map),
        node = point.getElement();
      map.fire('move');
      const canvas = host.querySelector<HTMLCanvasElement>('.oem-canvas-markers')!;
      const cssWidth = parseFloat(canvas.style.width);
      expect(canvas.width).toBe(cssWidth * 2);
      vi.stubGlobal('devicePixelRatio', 3);
      changed!();
      map.fire('move');
      expect(canvas.width).toBe(cssWidth * 3);
      expect(point.getElement()).toBe(node);
      vi.stubGlobal('devicePixelRatio', 1.5);
      map.fire('move');
      expect(canvas.width).toBe(cssWidth * 2);
      map.remove();
      removed = true;
      expect(remove).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('preserves logical members, semantic node identity and handlers while browsing', () => {
    const near = marker([0, 0]),
      far = marker([1000, 1000]),
      clicked = vi.fn();
    far.on('click', clicked);
    const group = L.layerGroup([near, far]).addTo(map),
      node = far.getElement()!;
    expect(map.hasLayer(far)).toBe(true);
    expect(group.hasLayer(far)).toBe(true);
    expect(node.closest('.oem-canvas-semantics')).not.toBeNull();
    map.setView([1000, 1000], 2, { animate: false });
    expect(far.getElement()).toBe(node);
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicked).toHaveBeenCalledOnce();
  });
  it('reuses small pans, repaints uncovered views, and keeps hit coordinates attached to the point', () => {
    const point = marker([0, 0]).addTo(map),
      node = point.getElement(),
      clicked = vi.fn();
    point.on('click', clicked);
    map.fire('move');
    const canvas = host.querySelector<HTMLCanvasElement>('.oem-canvas-markers')!;
    const clear = vi.fn();
    canvas.getContext('2d')!.clearRect = clear;
    map.panBy([12, 7], { animate: false });
    expect(clear).not.toHaveBeenCalled();
    expect(canvasSurface(map).visualPosition(point)?.equals(point.getLatLng())).toBe(true);
    const p = map.latLngToContainerPoint(point.getLatLng());
    host.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: p.x, clientY: p.y - 16 }));
    expect(clicked).toHaveBeenCalledOnce();
    expect(point.getElement()).toBe(node);
    map.panBy([180, 0], { animate: false });
    expect(clear).toHaveBeenCalled();
    clear.mockClear();
    map.setZoom(3);
    expect(clear).toHaveBeenCalled();
  });
  it('updates stationary-pointer hover and reports actual viewport exit once while the canvas is retained', () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    try {
      const point = marker([0, 0]).addTo(map),
        leave = vi.fn(),
        hidden = vi.fn();
      point.on('mouseout', leave);
      point.on('viewporthide', hidden);
      map.fire('move');
      const p = map.latLngToContainerPoint(point.getLatLng());
      host.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: p.x, clientY: p.y - 16 }));
      map.panBy([24, 0], { animate: false });
      expect(leave).toHaveBeenCalledOnce();
      map.panBy([600, 0], { animate: false });
      map.fire('move');
      expect(hidden).toHaveBeenCalledOnce();
      map.setZoom(3);
      expect(hidden).toHaveBeenCalledOnce();
      map.setView([0, 0], 2, { animate: false });
      map.setView([0, 1000], 2, { animate: false });
      expect(hidden).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it.each([
    [1440, 900],
    [800, 600],
    [320, 200],
    [0, 0],
  ])('bounds retained backing area for %s × %s without lowering density', (width, height) => {
    const padding = canvasPadding(width, height);
    expect(padding).toBeGreaterThanOrEqual(0);
    expect(padding).toBeLessThanOrEqual(128);
    expect((width + 2 * padding) * (height + 2 * padding)).toBeLessThanOrEqual(width * height * 1.5);
  });
  it('tracks exit, re-entry and diagonal exit at cached viewport edges without repainting', () => {
    const point = marker([0, 96]).addTo(map),
      hidden = vi.fn();
    point.on('viewporthide', hidden);
    map.fire('move');
    const clear = vi.fn();
    host.querySelector('canvas')!.getContext('2d')!.clearRect = clear;
    map.panBy([-64, 0], { animate: false });
    expect(hidden).toHaveBeenCalledOnce();
    map.panBy([64, 0], { animate: false });
    map.panBy([-64, -40], { animate: false });
    expect(hidden).toHaveBeenCalledTimes(2);
    expect(clear).not.toHaveBeenCalled();
  });
  it('keeps semantic events outside the moving pane while retaining the visual pane', () => {
    const point = marker([0, 0]).addTo(map),
      keyPressed = vi.fn();
    point.on('keypress', keyPressed);
    const node = point.getElement()!,
      semantic = node.closest('.oem-canvas-semantics')!;
    expect(semantic.parentElement).toBe(host);
    expect(map.getPane('mapPane')!.contains(semantic)).toBe(false);
    expect(host.querySelector('.oem-canvas-markers')!.parentElement).toBe(map.getPane('markerPane'));
    node.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, key: 'Enter', keyCode: 13 }));
    expect(keyPressed).toHaveBeenCalledOnce();
    point.remove();
    point.addTo(map);
    expect(point.getElement()!.closest('.oem-canvas-semantics')!.parentElement).toBe(host);
  });
  it('adds and removes filter groups without losing members or leaking surfaces', () => {
    const groups = Array.from({ length: 3 }, (_, i) => L.layerGroup([marker([i, i]), marker([1000, 1000])]));
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const group of groups) group.addTo(map);
      expect(host.querySelectorAll('.oem-canvas-markers')).toHaveLength(1);
      for (const group of groups)
        for (const point of group.getLayers()) expect(map.hasLayer(point)).toBe(true);
      for (const group of groups) group.remove();
      expect(host.querySelectorAll('.oem-canvas-semantics .leaflet-marker-icon')).toHaveLength(0);
    }
  });
  it('keeps popup and tooltip ownership on their authored points', () => {
    const point = marker([0, 0]).addTo(map).bindTooltip('details').bindPopup('popup', { autoPan: false });
    point.openTooltip();
    point.openPopup();
    map.setView([1000, 1000], 2, { animate: false });
    expect(point.getTooltip()?.isOpen()).toBe(true);
    expect(point.isPopupOpen()).toBe(true);
  });
  it('updates positions without replacing a marker node', () => {
    const point = marker([1000, 1000]).addTo(map),
      node = point.getElement();
    point.setLatLng([0, 0]);
    expect(point.getElement()).toBe(node);
    expect(point.getLatLng()).toEqual(L.latLng(0, 0));
  });
  it('preserves keyboard focus when the camera moves', () => {
    const point = marker([0, 0]).addTo(map),
      node = point.getElement()!;
    node.focus();
    map.setView([1000, 1000], 2, { animate: false });
    expect(document.activeElement).toBe(node);
    expect(node.isConnected).toBe(true);
  });
  it('uses one scene for dense points and retains all semantic nodes', () => {
    const points = Array.from({ length: 1200 }, () => marker([0, 0]));
    L.layerGroup(points).addTo(map);
    expect(host.querySelectorAll('.oem-canvas-markers')).toHaveLength(1);
    expect(points.every((point) => point.getElement()?.isConnected)).toBe(true);
    expect(points.every((point) => point.getElement()?.style.transform === '')).toBe(true);
  });
  it('releases the scene and semantic nodes on map destruction', () => {
    marker([0, 0]).addTo(map);
    map.remove();
    removed = true;
    expect(host.querySelector('.oem-canvas-markers')).toBeNull();
    expect(host.querySelector('.oem-canvas-semantics')).toBeNull();
  });
});
