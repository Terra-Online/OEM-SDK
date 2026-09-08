import L from 'leaflet';
interface TileLevel {
    el: HTMLElement;
    origin: L.Point;
    zoom: number;
}
interface ContinuousPixelMap extends L.Map {
    _getNewPixelOrigin(center: L.LatLng, zoom: number): L.Point;
}
export class SmoothTileLayer extends L.TileLayer {
    _setZoomTransform(level: TileLevel, center: L.LatLng, zoom: number) {
        const map = (this as unknown as {
            _map?: ContinuousPixelMap;
        })._map;
        if (!map)
            return;
        const scale = map.getZoomScale(zoom, level.zoom);
        const translate = level.origin
            .multiplyBy(scale)
            .subtract(map._getNewPixelOrigin(center, zoom));
        if (L.Browser.any3d) {
            L.DomUtil.setTransform(level.el, translate, scale);
        }
        else {
            L.DomUtil.setPosition(level.el, translate);
        }
    }
}
