// The real Leaflet + Geoman wiring in jsdom: no tiles render, but the map, layers and Geoman modes do.
import L from 'leaflet';
import { demoFields } from '../fixtures';
import { createLeafletMap, type MapController, type MapHandlers } from './leafletMap';
import en from './parcels/messages/en.json';
import pl from './parcels/messages/pl.json';

let container: HTMLDivElement;
let handlers: { [K in keyof MapHandlers]: ReturnType<typeof vi.fn> };
let controller: MapController;
let map: L.Map;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  handlers = {
    onClick: vi.fn(),
    onTileError: vi.fn(),
    onSelectField: vi.fn(),
    onDrawn: vi.fn(),
    onEdited: vi.fn(),
    onRemoved: vi.fn(),
    onCut: vi.fn(),
    onCutMode: vi.fn(),
    onParcelLayerError: vi.fn(),
  };
  const spy = vi.spyOn(L, 'map');
  controller = createLeafletMap(container, handlers as unknown as MapHandlers);
  map = spy.mock.results[0]!.value as L.Map;
  spy.mockRestore();
});

afterEach(() => {
  controller.destroy();
  container.remove();
});

const polygonsOnMap = () => {
  const found: L.Polygon[] = [];
  map.eachLayer((layer) => {
    if (layer instanceof L.Polygon) found.push(layer);
  });
  return found;
};

describe('createLeafletMap with Geoman', () => {
  it('shows only the draw polygon, edit and delete tools', () => {
    const icons = [...container.querySelectorAll('.leaflet-pm-toolbar .control-icon')]
      .filter((el) => (el.closest('.button-container') as HTMLElement | null)?.style.display !== 'none')
      .map((el) => /leaflet-pm-icon-([\w-]+)/.exec(el.className)?.[1]);
    expect(icons.sort()).toEqual(['delete', 'edit', 'polygon']);
  });

  it('reports a draw, edit or delete mode through isEditing', () => {
    expect(controller.isEditing()).toBe(false);
    map.pm.enableDraw('Polygon');
    expect(controller.isEditing()).toBe(true);
    map.pm.disableDraw();
    map.pm.enableGlobalEditMode();
    expect(controller.isEditing()).toBe(true);
    map.pm.disableGlobalEditMode();
    map.pm.enableGlobalRemovalMode();
    expect(controller.isEditing()).toBe(true);
    map.pm.disableGlobalRemovalMode();
    expect(controller.isEditing()).toBe(false);
  });

  it('hands a finished outline to onDrawn and takes the drawn layer off the map', () => {
    const drawn = L.polygon([
      [52.4, 16.9],
      [52.4, 16.91],
      [52.41, 16.91],
    ]).addTo(map);

    map.fire('pm:create', { shape: 'Polygon', layer: drawn });

    expect(handlers.onDrawn).toHaveBeenCalledWith(expect.objectContaining({ type: 'Polygon' }));
    const ring = handlers.onDrawn.mock.calls[0]![0].coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(map.hasLayer(drawn)).toBe(false);
  });

  it('reports an edited field outline and a removed field by id', () => {
    controller.setFields([demoFields.poznan], demoFields.poznan.id);
    const [layer] = polygonsOnMap();
    expect(layer).toBeDefined();

    layer!.fire('pm:edit', { shape: 'Polygon', layer });
    expect(handlers.onEdited).toHaveBeenCalledWith(demoFields.poznan.id, expect.objectContaining({ type: 'Polygon' }));

    layer!.fire('pm:remove', { shape: 'Polygon', layer });
    expect(handlers.onRemoved).toHaveBeenCalledWith(demoFields.poznan.id);
  });

  it('does not select a field tapped in delete mode', () => {
    controller.setFields([demoFields.poznan], null);
    const [layer] = polygonsOnMap();
    layer!.fire('click');
    expect(handlers.onSelectField).toHaveBeenCalledTimes(1);

    map.pm.enableGlobalRemovalMode();
    controller.setFields([demoFields.poznan], null);
    polygonsOnMap()[0]!.fire('click');
    expect(handlers.onSelectField).toHaveBeenCalledTimes(1);
  });

  it('turns a tap on a field into a corner of the outline being drawn, without selecting the field', () => {
    controller.setFields([demoFields.poznan], null);
    map.pm.enableDraw('Polygon');
    const field = polygonsOnMap()[0]!;
    const corner = field.getBounds().getCenter();

    field.fire('click', { latlng: corner });

    expect(handlers.onSelectField).not.toHaveBeenCalled();
    const drawing = (map.pm.Draw as unknown as { Polygon: { _layer: L.Polyline } }).Polygon._layer;
    expect(drawing.getLatLngs()).toEqual([corner]);
    map.pm.disableDraw();
  });

  it('moves the map to a found place and keeps one marker there, which a tap passes through', () => {
    const markers = () => {
      const found: L.CircleMarker[] = [];
      map.eachLayer((layer) => {
        if (layer instanceof L.CircleMarker) found.push(layer);
      });
      return found;
    };
    const { lat, lon } = demoFields.poznan.centroid;

    controller.showPlace(demoFields.iowa.centroid.lat, demoFields.iowa.centroid.lon, demoFields.iowa.name);
    controller.showPlace(lat, lon, demoFields.poznan.name);

    expect(markers()).toHaveLength(1);
    expect(markers()[0]!.getLatLng()).toEqual(L.latLng(lat, lon));
    expect(markers()[0]!.options.interactive).toBe(false);
    expect(map.getCenter().lat).toBeCloseTo(lat, 6);
    expect(map.getCenter().lng).toBeCloseTo(lon, 6);
    expect(handlers.onClick).not.toHaveBeenCalled();
  });
});

describe('cutting a field along a line', () => {
  const tap = (lat: number, lon: number) => map.fire('click', { latlng: L.latLng(lat, lon) });
  const { lat, lon } = demoFields.poznan.centroid;

  it('takes two taps as the line, hands it over as [lon, lat] pairs and ends the mode', () => {
    controller.startCut();
    expect(controller.isEditing()).toBe(true);
    expect(handlers.onCutMode).toHaveBeenLastCalledWith(true);

    tap(lat, lon);
    expect(handlers.onCut).not.toHaveBeenCalled();
    tap(lat + 0.001, lon + 0.002);

    expect(handlers.onCut).toHaveBeenCalledTimes(1);
    const [[a, b]] = handlers.onCut.mock.calls[0]! as [[[number, number], [number, number]]];
    expect(a[0]).toBeCloseTo(lon, 9);
    expect(a[1]).toBeCloseTo(lat, 9);
    expect(b[0]).toBeCloseTo(lon + 0.002, 9);
    expect(b[1]).toBeCloseTo(lat + 0.001, 9);
    expect(handlers.onClick).not.toHaveBeenCalled();
    expect(controller.isEditing()).toBe(false);
    expect(handlers.onCutMode).toHaveBeenLastCalledWith(false);
  });

  it('treats a tap on a field as a point of the line, without selecting the field', () => {
    controller.setFields([demoFields.poznan], null);
    controller.startCut();
    polygonsOnMap()[0]!.fire('click', { latlng: L.latLng(lat, lon) });
    expect(handlers.onSelectField).not.toHaveBeenCalled();
    tap(lat + 0.001, lon);
    expect(handlers.onCut).toHaveBeenCalledTimes(1);
  });

  it('cancels without a cut, and taps add fields again afterwards', () => {
    controller.startCut();
    tap(lat, lon);
    controller.stopCut();
    expect(handlers.onCut).not.toHaveBeenCalled();
    expect(handlers.onCutMode).toHaveBeenLastCalledWith(false);
    expect(controller.isEditing()).toBe(false);

    tap(lat, lon);
    expect(handlers.onClick).toHaveBeenCalledTimes(1);
  });

  it('forgets a half-drawn line when the mode is started again', () => {
    controller.startCut();
    tap(lat, lon);
    controller.stopCut();
    controller.startCut();
    tap(lat + 0.01, lon + 0.01);
    expect(handlers.onCut).not.toHaveBeenCalled();
  });

  it('stops when a Geoman draw tool is switched on, and switches Geoman modes off when it starts', () => {
    map.pm.enableGlobalRemovalMode();
    controller.startCut();
    expect(map.pm.globalRemovalModeEnabled()).toBe(false);

    map.pm.enableDraw('Polygon');
    expect(handlers.onCutMode).toHaveBeenLastCalledWith(false);
    map.pm.disableDraw();
    tap(lat, lon);
    expect(handlers.onCut).not.toHaveBeenCalled();
  });
});

describe('the parcel map layer', () => {
  const wmsLayers = () => {
    const found: L.TileLayer.WMS[] = [];
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer.WMS) found.push(layer);
    });
    return found;
  };

  it('is off at first, shows the KIEG parcels and numbers when switched on, and leaves when switched off', () => {
    expect(wmsLayers()).toHaveLength(0);

    controller.setParcelLayer(true);
    expect(wmsLayers()).toHaveLength(1);
    expect(wmsLayers()[0]!.wmsParams).toMatchObject({ layers: 'dzialki,numery_dzialek', version: '1.3.0', transparent: true });
    controller.setParcelLayer(true);
    expect(wmsLayers()).toHaveLength(1);

    controller.setParcelLayer(false);
    expect(wmsLayers()).toHaveLength(0);
  });

  it('is sent to integracja02, the GUGiK host that D49 allows and that answers every Web Mercator request', () => {
    controller.setParcelLayer(true);
    expect(new URL((wmsLayers()[0] as unknown as { _url: string })._url).hostname).toBe('integracja02.gugik.gov.pl');
  });

  // #143 review: KIEG draws parcel borders only up to 1:5 000 (numbers 1:3 000) in its capabilities; a zoom-16 tile at the
  // Poznań demo field came back blank. Asking from zoom 14 left the farmer with a ticked box and an empty map.
  it('asks for tiles only from zoom 17, where KIEG draws parcel borders, and the hint says the same', () => {
    controller.setParcelLayer(true);
    expect(wmsLayers()[0]!.options.minZoom).toBe(17);
    expect(en['edit.layer.hint']).toContain('17');
    expect(pl['edit.layer.hint']).toContain('17');
  });

  it('reports a tile that did not load', () => {
    controller.setParcelLayer(true);
    wmsLayers()[0]!.fire('tileerror');
    expect(handlers.onParcelLayerError).toHaveBeenCalledTimes(1);
  });
});
