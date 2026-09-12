// @vitest-environment jsdom
import L from 'leaflet';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CanvasClusterGroup, CanvasClusterMarker } from '../packages/map/src/atlos/canvas/clusterGroup';
import { ViewportMarker } from '../packages/map/src/atlos/canvas/markerViewport';

let host: HTMLDivElement, map: L.Map, group: CanvasClusterGroup;
beforeEach(() => {
  host = document.createElement('div'); document.body.append(host);
  Object.defineProperties(host, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
  map = L.map(host, { crs: L.CRS.Simple, minZoom: 0, maxZoom: 4, zoomAnimation: false }).setView([0, 0], 0);
  group = new CanvasClusterGroup({ expandOnClick: true, disableClusteringAtZoom: 2, maxClusterRadius: 60,
    iconCreateFunction: cluster => L.divIcon({ html: `<span class="markerInner"><span class="clusterCount">${cluster.getChildCount()}</span></span>` }),
  });
});
afterEach(() => { map.remove(); host.remove(); });
const point = (x: number) => new ViewportMarker([0, x], { icon: L.divIcon({ html: '<span class="markerInner">point</span>' }) });
describe('native Canvas cluster group', () => {
  it('separates logical membership from visible summaries and restores all members on zoom', () => {
    const points = [point(0), point(10), point(200)]; group.addLayers(points).addTo(map);
    expect(group.getLayers()).toEqual(points);
    const parent = group.getVisibleParent(points[0]);
    expect(parent).toBeInstanceOf(CanvasClusterMarker);
    expect(group.getVisibleParent(points[1])).toBe(parent);
    expect(group.getVisibleParent(points[2])).toBe(points[2]);
    map.setZoom(3);
    expect(points.every(marker => group.getVisibleParent(marker) === marker && map.hasLayer(marker))).toBe(true);
  });
  it('expands to authored coordinates and retains expansion while panning', () => {
    const points = [point(0), point(10)]; group.addLayers(points).addTo(map);
    const positions = points.map(marker => marker.getLatLng().clone());
    group.expand(group.getVisibleParent(points[0]) as CanvasClusterMarker);
    map.panBy([10, 0], { animate: false });
    expect(points.every(marker => group.getVisibleParent(marker) === marker && map.hasLayer(marker))).toBe(true);
    expect(points.map(marker => marker.getLatLng())).toEqual(positions);
  });
  it('removes expanded members and can be detached and attached again', () => {
    const a = point(0), b = point(10); group.addLayers([a, b]).addTo(map);
    group.expand(group.getVisibleParent(a) as CanvasClusterMarker);
    group.removeLayer(a);
    expect(group.hasLayer(a)).toBe(false); expect(map.hasLayer(a)).toBe(false);
    expect(group.getVisibleParent(b)).toBe(b);
    group.remove(); group.addTo(map);
    expect(group.hasLayer(b)).toBe(true); expect(map.hasLayer(b)).toBe(true);
    group.clearLayers(); expect(group.getLayers()).toEqual([]); expect(map.hasLayer(b)).toBe(false);
  });
});
