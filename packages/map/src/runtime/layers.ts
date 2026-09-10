import L from 'leaflet';
import type { OEMFloor, OEMRegion } from '@opendfieldmap/core';
import { SmoothTileLayer } from '../atlos/smoothTileLayer';
import { appendOEMTileVersion, lookupOEMTile } from '../tileVersion';

/** Leaflet marker with the subpixel positioning used by Atlos. */
export class OEMMarker extends L.Marker {
  update(): this {
    const marker = this as unknown as { _icon?: HTMLElement; _map?: L.Map; _latlng: L.LatLng; _setPos(point: L.Point): void };
    if (marker._icon && marker._map) marker._setPos(marker._map.latLngToLayerPoint(marker._latlng));
    return this;
  }
  _animateZoom(event: { center: L.LatLng; zoom: number }): void {
    const marker = this as unknown as {
      _map?: L.Map & { _latLngToNewLayerPoint(latlng: L.LatLng, zoom: number, center: L.LatLng): L.Point };
      _latlng: L.LatLng;
      _setPos(point: L.Point): void;
    };
    if (marker._map) marker._setPos(marker._map._latLngToNewLayerPoint(marker._latlng, event.zoom, event.center));
  }
}

/** Tile layer that skips coordinates absent from the published coverage index. */
export class CoveredTileLayer extends SmoothTileLayer {
  constructor(url: string, options: L.TileLayerOptions, private coverage: OEMRegion['coverage'], private floor: OEMFloor) {
    super(url, options);
  }
  getTileUrl(coords: L.Coords): string {
    const tile = lookupOEMTile(this.coverage, this.floor, coords.z, coords.x, coords.y);
    return appendOEMTileVersion(super.getTileUrl(coords), tile.version);
  }
  _isValidTile(coords: L.Coords): boolean {
    const prototype = L.GridLayer.prototype as unknown as {
      _isValidTile(this: L.GridLayer, value: L.Coords): boolean;
    };
    return prototype._isValidTile.call(this, coords) &&
      lookupOEMTile(this.coverage, this.floor, coords.z, coords.x, coords.y).covered;
  }
}
