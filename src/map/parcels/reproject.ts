// Polish national grid PUWG 1992 (EPSG:2180) to and from WGS84. ULDK answers in 2180 by default and KIEG renders only in 2180.
import proj4 from 'proj4';

// EPSG:2180, ETRF2000-PL / CS92: transverse Mercator on GRS80, central meridian 19° E. Easting first, then northing.
const EPSG_2180 =
  '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

proj4.defs('EPSG:2180', EPSG_2180);
const converter = proj4('EPSG:2180', 'EPSG:4326');

/** [easting, northing] in EPSG:2180 to [lon, lat] in WGS84. */
export function toWgs84([x, y]: readonly number[]): [number, number] {
  const [lon, lat] = converter.forward([x ?? NaN, y ?? NaN]);
  return [lon!, lat!];
}

/** [lon, lat] in WGS84 to [easting, northing] in EPSG:2180. */
export function fromWgs84([lon, lat]: readonly number[]): [number, number] {
  const [x, y] = converter.inverse([lon ?? NaN, lat ?? NaN]);
  return [x!, y!];
}
