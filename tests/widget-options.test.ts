// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOEMWidget } from '@opendfieldmap/sdk';
import type { OEMWidget } from '@opendfieldmap/sdk';
import { createManifest, deferred, json } from './fixtures';

let host: HTMLDivElement;
let widget: OEMWidget | undefined;
const manifest = () => {
  const value = createManifest();
  value.regions[0].subregions = [
    { id: 'VL_1', key: 'first', bounds: [[1000,1000],[2000,2000]] },
    { id: 'VL_2', key: 'second', bounds: [[2000,2000],[3000,3000]] },
  ];
  return value;
};
beforeEach(() => {
  host = document.createElement('div'); host.style.height = '480px'; document.body.append(host);
  vi.stubGlobal('fetch', vi.fn(async input => json(String(input).endsWith('/labels.json') ? [] : {})));
});
afterEach(() => { widget?.destroy(); widget = undefined; vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe('Widget uses the shared behavior API', () => {
  it('mounts the official controls and leaves interactions unlocked', async () => {
    widget = await createOEMWidget(host, { manifest: manifest() });
    expect(host.querySelector('.regionSwitch')).not.toBeNull();
    expect(host.querySelector('.layerSwitch')).not.toBeNull();
    expect(host.querySelector('.scaleControl')).not.toBeNull();
    expect(widget.getState()).toMatchObject({ lockDrag: false, lockZoom: false });
  });
  it('supports the official horizontal selector layout', async () => {
    widget = await createOEMWidget(host, { manifest: manifest(), horizontalSelectors: true });
    expect(host.querySelector('.switchArea.horizontalSelectors')).not.toBeNull();
    expect(host.querySelector('.switchLabel')).toBeNull();
  });
  it('hides controls independently', async () => {
    widget = await createOEMWidget(host, { manifest: manifest(), showRegionSelector: false, showFloorSelector: false, showScaleBar: false });
    expect(host.querySelector('.controlOverlay')).toBeNull();
    expect(host.querySelector('.mapRoot')).not.toBeNull();
  });
  it('reads authoritative map state and synchronizes controls after direct map commands', async () => {
    const changed = vi.fn();
    widget = await createOEMWidget(host, { manifest: manifest(), onStateChange: changed });
    await widget.map.setFloor('B1');
    expect(widget.getState()).toEqual(widget.map.getState());
    expect(widget.getState().floorId).toBe('B1');
    expect(host.querySelector('.floorItem.selected')?.textContent).toBe('B1');
    expect(changed).toHaveBeenCalledTimes(1);
    const copy = widget.getState(); copy.center.x = 999;
    expect(widget.getState().center.x).not.toBe(999);
  });
  it('shares the same command queue across Widget and map', async () => {
    widget = await createOEMWidget(host, { manifest: manifest(), labels: false });
    const pending = deferred<Response>(); vi.mocked(fetch).mockReturnValue(pending.promise);
    const first = widget.setOptions({ customPointsUrl: '/custom.json', zoom: 3 });
    const second = widget.map.setFloor('B1');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(widget.getState()).toMatchObject({ zoom: 2, floorId: 'M' });
    pending.resolve(json([])); await Promise.all([first, second]);
    expect(widget.getState()).toMatchObject({ zoom: 3, floorId: 'B1' });
  });
  it('does not emit state changes or reload data for identical configuration', async () => {
    const changed = vi.fn(); widget = await createOEMWidget(host, { manifest: manifest(), onStateChange: changed });
    vi.mocked(fetch).mockClear();
    await widget.setOptions({ labels: true, zoom: widget.getState().zoom });
    expect(changed).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('reflects dynamic locks in official controls without locking programmatic view changes', async () => {
    widget = await createOEMWidget(host, { manifest: manifest(), labels: false });
    await widget.map.setInteractionLocks({ lockDrag: true, lockZoom: true });
    expect(host.querySelector<HTMLButtonElement>('.zoomIn')?.disabled).toBe(true);
    await widget.map.setZoom(3); expect(widget.getState().zoom).toBe(3);
    await widget.map.setInteractionLocks({ lockZoom: false });
    expect(host.querySelector<HTMLButtonElement>('.zoomIn')?.disabled).toBe(false);
  });
  it('updates both official theme roots from a map command', async () => {
    widget = await createOEMWidget(host, { manifest: manifest(), labels: false });
    await widget.map.setTheme('dark');
    expect(host.querySelector('.oemWidget')?.getAttribute('data-theme')).toBe('dark');
    expect(host.querySelector('.mapRoot')?.getAttribute('data-theme')).toBe('dark');
  });
  it('exposes point commands through the same collection', async () => {
    widget = await createOEMWidget(host, { manifest: manifest(), labels: false });
    const point = { id: 'host', position: { regionId: 'Valley_4', x: 400, z: 500 }, style: 'framed' as const, icon: '/pin.webp' };
    await widget.setCustomPoints([point]);
    expect(widget.map.getCustomPoint('host')).toEqual(point);
    const copy = widget.map.getCustomPoints(); copy[0].position.x = 0;
    expect(widget.map.getCustomPoint('host')?.position.x).toBe(400);
    await widget.clearCustomPoints(); expect(widget.map.getCustomPoints()).toEqual([]);
  });
  it('forwards independent map click subscriptions and unsubscription', async () => {
    widget = await createOEMWidget(host, { manifest: manifest(), labels: false });
    const handler = vi.fn(); const stop = widget.on('click', handler);
    host.querySelector('.mapRoot')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 120, clientY: 160 }));
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0]).toMatchObject({ mapPosition: { space: 'map' }, pixelPosition: { space: 'pixel' } });
    expect(widget.map.getCustomPoints()).toEqual([]);
    stop(); host.querySelector('.mapRoot')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledOnce();
  });
  it('handles official selector input through map state', async () => {
    widget = await createOEMWidget(host, { manifest: manifest(), labels: false });
    host.querySelector<HTMLElement>('[data-subregion="VL_2"]')!.click();
    await vi.waitFor(() => expect(widget!.getState().subregionId).toBe('VL_2'));
    expect(widget.map.getState().center).toEqual({ x: 2500, z: 2500 });
  });
  it('ends compact scale dragging after implicit pointer capture release', async () => {
    widget = await createOEMWidget(host, { manifest: manifest(), labels: false });
    const track = host.querySelector<HTMLElement>('.scaleTrack')!;
    Object.defineProperties(track, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: vi.fn(() => false) },
      releasePointerCapture: { value: vi.fn() },
    });
    const pointer = (type: string) => {
      const event = new MouseEvent(type, { bubbles: true, clientY: 100 });
      Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'touch' } });
      track.dispatchEvent(event);
    };
    pointer('pointerdown');
    expect(host.querySelector('.scaleControl')?.classList.contains('dragging')).toBe(true);
    pointer('pointerup');
    expect(host.querySelector('.scaleControl')?.classList.contains('dragging')).toBe(false);
  });
  it('keeps touch-expanded panels mutually exclusive', async () => {
    widget = await createOEMWidget(host, { manifest: manifest(), labels: false });
    const touch = () => { const event = new Event('pointerdown', { bubbles: true }); Object.defineProperty(event, 'pointerType', { value: 'touch' }); return event; };
    const region = host.querySelector<HTMLElement>('.regionEntry')!;
    const floor = host.querySelector<HTMLElement>('.layerSwitch .switchItem')!;
    region.dispatchEvent(touch()); expect(region.classList.contains('expanded')).toBe(true);
    floor.dispatchEvent(touch()); expect(floor.classList.contains('expanded')).toBe(true); expect(region.classList.contains('expanded')).toBe(false);
  });
  it('does not report cancelled control commands after destruction', async () => {
    const error = vi.fn();
    widget = await createOEMWidget(host, { manifest: manifest(), labels: false, onError: error });
    host.querySelector<HTMLButtonElement>('.zoomIn')!.click();
    widget.destroy();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(error).not.toHaveBeenCalled();
  });
  it('cleans the Widget when its map is destroyed directly', async () => {
    widget = await createOEMWidget(host, { manifest: manifest(), labels: false });
    widget.map.destroy(); expect(widget.destroyed).toBe(true); expect(host.children).toHaveLength(0);
    widget = await createOEMWidget(host, { manifest: manifest(), labels: false });
    expect(widget.destroyed).toBe(false);
  });
  it('cleans up if onReady throws', async () => {
    await expect(createOEMWidget(host, { manifest: manifest(), labels: false, onReady: () => { throw new Error('ready failed'); } })).rejects.toThrow('ready failed');
    expect(host.children).toHaveLength(0);
    widget = await createOEMWidget(host, { manifest: manifest(), labels: false });
  });
});
