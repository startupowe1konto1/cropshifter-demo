// The only file that talks to Leaflet. MapStep stays testable in jsdom by mocking this module.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import './draw/draw.css';
import type { Polygon, Position } from 'geojson';
import type { Field } from '../contracts';

export interface MapHandlers {
  onClick(lat: number, lon: number): void;
  onTileError(): void;
  onSelectField(id: string): void;
  /** A new outline finished in draw mode. The drawn layer is already gone; the field comes back through setFields. */
  onDrawn(polygon: Polygon): void;
  /** A field's outline changed in edit mode. */
  onEdited(id: string, polygon: Polygon): void;
  /** A field was tapped in delete mode. */
  onRemoved(id: string): void;
  /** Cut mode: the second tap came in. The line runs through these two [lon, lat] points; the mode is already off. */
  onCut(line: [Position, Position]): void;
  /** Cut mode went on or off, however it happened (two taps, cancel, or another map tool taking over). */
  onCutMode(active: boolean): void;
  /** A tile of the parcel layer did not load. */
  onParcelLayerError(): void;
}

export interface MapController {
  setFields(fields: Field[], selectedId: string | null): void;
  flyTo(field: Field): void;
  retryTiles(): void;
  destroy(): void;
  /** True while a Geoman draw, edit or delete mode is on, so a map tap must not add a point field. */
  isEditing(): boolean;
  /** Moves the map to a place found by the address search and marks it. One marker at a time. */
  showPlace(lat: number, lon: number, label: string): void;
  /** Cut mode: the next two taps on the map are the line a field is cut along. Switches the Geoman tools off. */
  startCut(): void;
  /** Leaves cut mode without a cut. */
  stopCut(): void;
  /** Shows or hides the land register parcels (KIEG, Poland). Visible from zoom 14. */
  setParcelLayer(on: boolean): void;
}

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const START_VIEW: L.LatLngTuple = [46, -40]; // between the USA and Poland
const START_ZOOM = 2;
const PLACE_ZOOM = 16; // close enough to see field edges and tap the right one
// KIEG, the national land register map from GUGiK, as a WMS image overlay in Web Mercator, so the map keeps its
// OpenStreetMap projection. The host is integracja02 (D49): integracja.gugik.gov.pl hands requests to two servers, and
// one of them (integracja01) fails EPSG:3857 requests with a projection error, integracja02 did not.
// Its capabilities draw parcel borders (`dz-*`) only up to 1:5 000 and numbers (`nr-*`) up to 1:3 000; a zoom-16 tile
// came back blank (#143 review). So tiles are only asked for from zoom 17, and numbers show from about zoom 18.
const KIEG_URL = 'https://integracja02.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow';
const KIEG_ATTRIBUTION = '&copy; <a href="https://integracja.gugik.gov.pl">GUGiK</a> KIEG';
const PARCEL_MIN_ZOOM = 17;

const toLatLngs = (field: Field): L.LatLngTuple[][] =>
  field.polygon.coordinates.map((ring) => ring.map(([lon = 0, lat = 0]) => [lat, lon] as L.LatLngTuple));

/** GeoJSON outline of a Leaflet polygon ([lon, lat], closed rings), or null for any other shape. */
function polygonOf(layer: L.Layer): Polygon | null {
  if (!(layer instanceof L.Polygon)) return null;
  const geometry = layer.toGeoJSON(7).geometry;
  return geometry.type === 'Polygon' ? geometry : null;
}

// Only the three tools a farmer needs: outline, move corners, delete. Everything else is off.
const TOOLBAR: L.PM.ToolbarOptions = {
  position: 'topleft',
  drawPolygon: true,
  editMode: true,
  removalMode: true,
  drawMarker: false,
  drawCircleMarker: false,
  drawPolyline: false,
  drawRectangle: false,
  drawCircle: false,
  drawText: false,
  dragMode: false,
  cutPolygon: false,
  rotateMode: false,
};

export function createLeafletMap(container: HTMLElement, handlers: MapHandlers): MapController {
  const map = L.map(container, { center: START_VIEW, zoom: START_ZOOM, worldCopyJump: true });
  const tiles = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  const fieldLayer = L.layerGroup().addTo(map);
  const placeLayer = L.layerGroup().addTo(map);
  const cutLayer = L.layerGroup().addTo(map);
  const parcelLayer = L.tileLayer.wms(KIEG_URL, {
    layers: 'dzialki,numery_dzialek',
    format: 'image/png',
    transparent: true,
    version: '1.3.0',
    minZoom: PARCEL_MIN_ZOOM,
    maxZoom: 19,
    attribution: KIEG_ATTRIBUTION,
  });
  parcelLayer.on('tileerror', () => handlers.onParcelLayerError());

  tiles.on('tileerror', () => handlers.onTileError());

  map.pm.addControls(TOOLBAR);
  // Geoman keeps the finished shape on the map. Drop it: the store owns fields and setFields draws them.
  map.on('pm:create', (e) => {
    const polygon = polygonOf(e.layer);
    e.layer.remove();
    if (polygon) handlers.onDrawn(polygon);
  });
  // Cut mode: `cutPoints` is null when off, else the taps so far (0 or 1).
  let cutPoints: Position[] | null = null;
  const setCutMode = (active: boolean) => {
    if ((cutPoints !== null) === active) return;
    cutPoints = active ? [] : null;
    cutLayer.clearLayers();
    handlers.onCutMode(active);
  };
  const isEditing = () =>
    cutPoints !== null ||
    map.pm.globalDrawModeEnabled() ||
    map.pm.globalEditModeEnabled() ||
    map.pm.globalRemovalModeEnabled();
  // Another map tool switched on: it owns the taps now.
  map.on('pm:drawstart pm:globaleditmodetoggled pm:globalremovalmodetoggled', (e) => {
    const toggled = e as { enabled?: boolean };
    if (toggled.enabled !== false) setCutMode(false);
  });
  map.on('click', (e: L.LeafletMouseEvent) => {
    const lon = L.Util.wrapNum(e.latlng.lng, [-180, 180], true);
    if (cutPoints) {
      cutPoints.push([lon, e.latlng.lat]);
      if (cutPoints.length < 2) {
        L.circleMarker(e.latlng, { radius: 6, color: '#b45309', weight: 3, fillOpacity: 1, interactive: false }).addTo(cutLayer);
        return;
      }
      const line = cutPoints as [Position, Position];
      setCutMode(false);
      handlers.onCut(line);
      return;
    }
    handlers.onClick(e.latlng.lat, lon);
  });

  return {
    setFields(fields, selectedId) {
      fieldLayer.clearLayers();
      for (const field of fields) {
        const selected = field.id === selectedId;
        L.polygon(toLatLngs(field), {
          color: selected ? '#047857' : '#475569',
          weight: selected ? 3 : 2,
          fillOpacity: selected ? 0.25 : 0.1,
          bubblingMouseEvents: false, // a tap on a field selects it instead of adding a new one
        })
          .on('click', (e: L.LeafletMouseEvent) => {
            // While drawing, a tap on a field is a corner of the new outline. The field stops the click from reaching
            // the map, so hand it on: Geoman adds the corner there. Selecting the field would fly the map away mid-draw.
            if (map.pm.globalDrawModeEnabled() || cutPoints) {
              map.fire('click', e);
              return;
            }
            // In delete mode the same tap removes the field; selecting it first would only flicker.
            if (!map.pm.globalRemovalModeEnabled()) handlers.onSelectField(field.id);
          })
          .on('pm:edit', (e) => {
            const polygon = polygonOf(e.layer);
            if (polygon) handlers.onEdited(field.id, polygon);
          })
          .on('pm:remove', () => handlers.onRemoved(field.id))
          .addTo(fieldLayer);
      }
    },
    flyTo(field) {
      const bounds = L.latLngBounds(toLatLngs(field)[0] ?? []);
      if (!bounds.isValid()) return;
      const size = map.getSize();
      // A hidden or zero-size map cannot animate; jump instead.
      if (size.x === 0 || size.y === 0) map.fitBounds(bounds, { animate: false });
      else map.flyToBounds(bounds, { padding: [24, 24], maxZoom: 17, duration: 1.2 });
    },
    retryTiles() {
      tiles.redraw();
    },
    destroy() {
      map.remove();
    },
    isEditing,
    startCut() {
      map.pm.disableDraw();
      map.pm.disableGlobalEditMode();
      map.pm.disableGlobalRemovalMode();
      setCutMode(false); // forget a half-drawn line
      setCutMode(true);
    },
    stopCut() {
      setCutMode(false);
    },
    setParcelLayer(on) {
      if (on && !map.hasLayer(parcelLayer)) parcelLayer.addTo(map);
      else if (!on && map.hasLayer(parcelLayer)) parcelLayer.remove();
    },
    showPlace(lat, lon, label) {
      placeLayer.clearLayers();
      // Not interactive: a tap on the marker still reaches the map, so it adds a field or a corner there.
      L.circleMarker([lat, lon], { radius: 9, color: '#b45309', weight: 3, fillColor: '#fbbf24', fillOpacity: 0.9, interactive: false })
        .bindTooltip(label, { permanent: false, direction: 'top' })
        .addTo(placeLayer);
      const size = map.getSize();
      if (size.x === 0 || size.y === 0) map.setView([lat, lon], PLACE_ZOOM, { animate: false });
      else map.flyTo([lat, lon], PLACE_ZOOM, { duration: 1.2 });
    },
  };
}
