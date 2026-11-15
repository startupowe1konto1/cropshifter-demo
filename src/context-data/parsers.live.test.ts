// Parsers of the live sources (task O4-A5), run against the saved samples in data/samples/.
// The expected values are the ones scripts/soil_point.py, gaez_suitability.py and cropscape_history.py
// computed from the same samples (data/precomputed/*.json).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CDL_TO_CROP, cropscapeProxyRequest, parseCdlValue, toEpsg5070 } from './cropscape';
import { GAEZ_SX_1981_2010, gaezIdentifyUrl, gaezMissingCrop, parseGaezIdentify } from './gaez';
import { parseSoilgrids, soilgridsUrl } from './soilgrids';
import { parseSda, sdaQuery } from './ssurgo';

const sample = (path: string) => readFileSync(`data/samples/${path}`, 'utf-8');
const day = '2026-11-14';

describe('SSURGO (Soil Data Access)', () => {
  const soil = parseSda(JSON.parse(sample('ssurgo/sda_point_demo-iowa.json')), day);

  it('depth-weights 0–30 cm and weights components like the precompute script', () => {
    expect(soil?.sandPct).toMatchObject({ value: 27, unit: '%', datasetIds: ['usda-ssurgo'], kind: 'observation', retrievedAt: day });
    expect(soil?.sandPct.range).toMatchObject({ low: 16.4, high: 36.1 });
    expect(soil?.clayPct).toMatchObject({ value: 30, range: { low: 27.2, high: 35.7 } });
    expect(soil?.organicCarbon).toMatchObject({ value: 3.75, unit: '% by weight', range: { low: 1.96, high: 5.12 } });
    expect(soil?.ph).toMatchObject({ value: 7.5, range: { low: 7.2, high: 7.7 } });
  });

  it('returns null when SDA has no horizon for the point', () => {
    expect(parseSda({}, day)).toBeNull();
    expect(parseSda({ Table: [['mukey']] }, day)).toBeNull();
  });

  it('a column without values is null with a reason', () => {
    const header = ['mukey', 'cokey', 'comppct_r', 'hzdept_r', 'hzdepb_r', 'sandtotal_r', 'om_r'];
    const s = parseSda({ Table: [header, ['1', '2', '100', '0', '30', '40', null]] }, day);
    expect(s?.sandPct.value).toBe(40);
    expect(s?.organicCarbon.value).toBeNull();
    expect(s?.organicCarbon.missingReason).toMatch(/SSURGO/);
  });

  it('asks for the map unit under the point', () => {
    expect(sdaQuery(42.5, -93.25)).toContain("point(-93.25 42.5)");
  });
});

describe('SoilGrids', () => {
  const soil = parseSoilgrids(JSON.parse(sample('soilgrids/properties_query_17.10_52.45_0-30cm.json')), day);

  it('depth-weights mean and 5–95% quantiles, as a model estimate', () => {
    expect(soil.sandPct).toMatchObject({ value: 71.4, kind: 'model', datasetIds: ['isric-soilgrids'], range: { low: 50.3, high: 88.8 } });
    expect(soil.clayPct).toMatchObject({ value: 10, range: { low: 1.3, high: 27.5 } });
    expect(soil.organicCarbon).toMatchObject({ value: 2.67, range: { low: 0.38, high: 7.95 } });
    expect(soil.ph).toMatchObject({ value: 6, range: { low: 4.1, high: 7.9 } });
  });

  it('a masked point (all values null) gives null with a reason', () => {
    const body = JSON.parse(sample('soilgrids/properties_query_17.10_52.45_0-30cm.json'));
    for (const layer of body.properties.layers) for (const d of layer.depths) d.values = { mean: null, 'Q0.05': null, 'Q0.95': null };
    const s = parseSoilgrids(body, day);
    expect(s.sandPct.value).toBeNull();
    expect(s.sandPct.missingReason).toMatch(/SoilGrids/);
  });

  it('an answer without layers is an error', () => {
    expect(() => parseSoilgrids({ detail: 'busy' }, day)).toThrow();
  });

  it('asks for four properties, three depths, mean and quantiles', () => {
    const url = new URL(soilgridsUrl(52.45, 17.1));
    expect(url.searchParams.getAll('property')).toEqual(['sand', 'clay', 'soc', 'phh2o']);
    expect(url.searchParams.getAll('depth')).toEqual(['0-5cm', '5-15cm', '15-30cm']);
  });
});

describe('FAO GAEZ', () => {
  it('reads the 0–10000 index as 0–100, one decimal', () => {
    const v = parseGaezIdentify(JSON.parse(sample('gaez/res05-identify-sxHr_mze-demo-iowa.json')), 'maize', day);
    expect(v).toMatchObject({ value: 100, unit: 'suitability index, 0–100', datasetIds: ['fao-gaez-v4'], kind: 'model' });
    expect(parseGaezIdentify({ value: '6123' }, 'maize', day).value).toBe(61.2);
  });

  it('NoData is null with a reason; an error body throws', () => {
    const v = parseGaezIdentify({ value: 'NoData' }, 'maize', day);
    expect(v.value).toBeNull();
    expect(v.missingReason).toMatch(/GAEZ/);
    expect(() => parseGaezIdentify({ error: { message: 'bad' } }, 'maize', day)).toThrow();
  });

  it('the raster ids are the sxHr CRUTS32 rasters of the service catalogue', () => {
    const catalogue = JSON.parse(sample('gaez/res05-suitability-rainfed-high-1981-2010.json')) as {
      features: { attributes: { objectid: number; crop: string; download_url: string } }[];
    };
    for (const { gaezCrop, objectId } of Object.values(GAEZ_SX_1981_2010)) {
      const row = catalogue.features.find((f) => f.attributes.objectid === objectId);
      expect(row?.attributes.crop).toBe(gaezCrop);
      expect(row?.attributes.download_url).toMatch(/CRUTS32\/Hist\/8110H\/sxHr_/);
    }
    const query = JSON.parse(sample('gaez/res05-query-maize-hr-1981-2070.json')) as {
      features: { attributes: { objectid: number; name: string; year: string } }[];
    };
    const maize = query.features.find((f) => f.attributes.name === 'sxHr_mze' && f.attributes.year === '1981-2010');
    expect(maize?.attributes.objectid).toBe(GAEZ_SX_1981_2010.maize?.objectId);
  });

  it('cover crops have no GAEZ crop', () => {
    expect(gaezMissingCrop('red-clover')).toMatch(/red clover/);
    expect(gaezMissingCrop('maize')).toBeUndefined();
  });

  it('locks the identify to one raster', () => {
    const url = new URL(gaezIdentifyUrl(52.45, 17.1, 257880));
    expect(JSON.parse(url.searchParams.get('mosaicRule') ?? '{}')).toEqual({ mosaicMethod: 'esriMosaicLockRaster', lockRasterIds: [257880] });
  });
});

describe('CropScape', () => {
  it('parses the GetCDLValue answer', () => {
    expect(parseCdlValue(sample('cropscape/getcdlvalue_2025_demo-iowa.xml'))).toEqual({ code: 5, name: 'Soybeans' });
    expect(() => parseCdlValue('<error/>')).toThrow();
  });

  it('projects to EPSG:5070 like the precompute script (checked against CropScape echo)', () => {
    const { x, y } = toEpsg5070(42.03, -93.63);
    expect(Math.abs(x - 194867.1)).toBeLessThan(1);
    expect(Math.abs(y - 2116698.2)).toBeLessThan(1);
  });

  it('maps CDL codes to crops of the US list', () => {
    expect(CDL_TO_CROP[1]).toBe('maize');
    expect(CDL_TO_CROP[141]).toBeUndefined();
    expect(cropscapeProxyRequest('/api/cropscape', 2025, 42.03, -93.63)).toBe('/api/cropscape?year=2025&x=194867.1&y=2116698.2');
  });
});
