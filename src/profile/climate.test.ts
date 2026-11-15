import {
  droughtShare, droughtYears, monthlyRisk, percentileValue, toMonthly, yearly, type Thresholds } from './climate';
import type { PowerMonthly } from './power';
import type { ClimateProfile } from '../contracts';

type Row = ClimateProfile['monthly'][number];
const SOURCE = { retrievedAt: '2026-11-14' };
const FIRST = 1981;

/** 45 years x 12 months. Root wetness is distinct inside each month's record; i = year index. */
function series(edit?: (row: Row, i: number) => void, years = 45): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < years; i++) {
    for (let month = 1; month <= 12; month++) {
      const row: Row = {
        year: FIRST + i,
        month,
        rootWetness: 0.3 + ((i * 7) % years) / 100 + month / 1000, // permuted so dry years differ by month
        rainMm: 50,
        tMaxC: 20 + i * 0.1,
        frostDays: i % 5,
        evapotranspirationMm: 40,
      };
      edit?.(row, i);
      rows.push(row);
    }
  }
  return rows;
}

const ALL: Thresholds = { droughtPercentile: 20, heatC: 23.95, frostDays: 3, heatMinDays: 3 };
const risk = (rows: Row[], month: number, hazard: string, t: Thresholds = ALL) =>
  monthlyRisk(rows, t, SOURCE).find((r) => r.month === month && r.hazard === hazard)!.probability;

describe('percentileValue (nearest rank)', () => {
  it('returns the ceil(p/100 * n)-th smallest value', () => {
    const v = Array.from({ length: 45 }, (_, i) => 45 - i);
    expect(percentileValue(v, 20)).toBe(9);
    expect(percentileValue([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentileValue([7], 20)).toBe(7);
  });
});

describe('toMonthly', () => {
  it('maps POWER parameters to the profile fields and keeps nulls', () => {
    const power: PowerMonthly = {
      retrievedAt: '2026-11-14',
      units: {},
      months: [
        { year: 2001, month: 2, GWETROOT: 0.5, GWETTOP: 0.4, PRECTOTCORR: 2, T2M_MAX: 3.5, FROST_DAYS: 20, EVPTRNS: 0.49 },
        { year: 2001, month: 3, GWETROOT: null, GWETTOP: null, PRECTOTCORR: null, T2M_MAX: null, FROST_DAYS: null, EVPTRNS: null },
      ],
    };
    const m = toMonthly(power);
    expect(m[0]).toEqual({ year: 2001, month: 2, rootWetness: 0.5, rainMm: 56, tMaxC: 3.5, frostDays: 20, evapotranspirationMm: expect.closeTo(5.6, 6) });
    expect(m[1]).toEqual({ year: 2001, month: 3, rootWetness: null, rainMm: null, tMaxC: null, frostDays: null, evapotranspirationMm: null });
  });
});

describe('monthlyRisk', () => {
  it('returns 12 months x 3 hazards', () => {
    const r = monthlyRisk(series(), ALL, SOURCE);
    expect(r).toHaveLength(36);
    for (let m = 1; m <= 12; m++) {
      expect(r.filter((x) => x.month === m).map((x) => x.hazard).sort()).toEqual(['drought', 'frost', 'heat']);
    }
  });

  it('drought = 9 of 45 years at the 20th percentile of the month’s own record', () => {
    for (const m of [1, 7, 12]) expect(risk(series(), m, 'drought').value).toBeCloseTo(9 / 45, 10);
  });

  it('heat = share of years with tMaxC above the threshold', () => {
    expect(risk(series(), 7, 'heat').value).toBeCloseTo(5 / 45, 10); // i = 40..44
  });

  it('frost = share of years with frost days above the threshold', () => {
    expect(risk(series(), 1, 'frost').value).toBeCloseTo(9 / 45, 10); // frostDays = 4
  });

  it('marks every value as our calculation from NASA POWER', () => {
    const p = risk(series(), 7, 'drought');
    expect(p).toMatchObject({ kind: 'derived', datasetIds: ['nasa-power-monthly'], unit: 'share of years', retrievedAt: '2026-11-14' });
  });

  it('leaves years with a null month out of the denominator', () => {
    const rows = series((row, i) => {
      if (row.month === 7 && i === 0) {
        row.tMaxC = null;
        row.rootWetness = null;
      }
    });
    expect(risk(rows, 7, 'heat').value).toBeCloseTo(5 / 44, 10);
    // 44 values: nearest rank ceil(8.8) = 9, so 9 of 44
    expect(risk(rows, 7, 'drought').value).toBeCloseTo(9 / 44, 10);
  });

  it('gives null with a reason when a month has no data at all', () => {
    const rows = series((row) => {
      if (row.month === 3) row.rootWetness = null;
    });
    const p = risk(rows, 3, 'drought');
    expect(p.value).toBeNull();
    expect(p.missingReason).toBeTruthy();
  });

  it('gives null with a reason when there is no crop-independent heat or frost threshold', () => {
    const t: Thresholds = { droughtPercentile: 20, heatC: null, frostDays: null, heatMinDays: 3 };
    for (const hazard of ['heat', 'frost']) {
      const p = risk(series(), 7, hazard, t);
      expect(p.value).toBeNull();
      expect(p.missingReason).toBe("no crop-independent threshold; the calendar uses each crop's own threshold");
    }
    expect(risk(series(), 7, 'drought', t).value).toBeCloseTo(0.2, 10);
  });
});

describe('yearly', () => {
  const rows = series((row, i) => {
    row.rootWetness = row.month >= 4 && row.month <= 9 ? 0.5 + i / 1000 : 0.9;
    row.rainMm = row.month;
    row.tMaxC = row.month === 7 ? 30 + i / 10 : 10;
    row.frostDays = row.month <= 3 ? 10 : 0;
  });

  it('summarises each year', () => {
    const y = yearly(rows, SOURCE);
    expect(y).toHaveLength(45);
    expect(y[0]!.year).toBe(1981);
    expect(y[2]!.growingSeasonWetness.value).toBeCloseTo(0.502, 10);
    expect(y[2]!.maxTempC.value).toBeCloseTo(30.2, 10);
    expect(y[2]!.frostDays.value).toBe(30);
    expect(y[2]!.rainMm.value).toBe(78);
    expect(y[2]!.rainMm).toMatchObject({ kind: 'derived', datasetIds: ['nasa-power-monthly'], unit: 'mm' });
  });

  it('gives null with a reason when a needed month is missing', () => {
    const gap = rows.map((r) => (r.year === 1990 && r.month === 5 ? { ...r, rootWetness: null, rainMm: null } : r));
    const y = yearly(gap, SOURCE).find((r) => r.year === 1990)!;
    expect(y.growingSeasonWetness.value).toBeNull();
    expect(y.growingSeasonWetness.missingReason).toMatch(/1990/);
    expect(y.rainMm.value).toBeNull();
    expect(y.maxTempC.value).not.toBeNull();
    const dec = rows.map((r) => (r.year === 1990 && r.month === 12 ? { ...r, rainMm: null } : r));
    expect(yearly(dec, SOURCE).find((r) => r.year === 1990)!.growingSeasonWetness.value).not.toBeNull();
  });
});

describe('droughtYears', () => {
  it('returns exactly the two planted dry growing seasons (10 years, 20th percentile)', () => {
    const rows = series((row, i) => {
      const season = row.month >= 4 && row.month <= 9;
      row.rootWetness = season && (i === 3 || i === 7) ? 0.1 : 0.5 + i / 100;
    }, 10);
    expect(droughtYears(rows, 20)).toEqual([1984, 1988]);
  });

  it('ignores dry months outside April to September', () => {
    const rows = series((row, i) => {
      row.rootWetness = !(row.month >= 4 && row.month <= 9) && i === 5 ? 0.01 : 0.5 + i / 100;
    }, 10);
    expect(droughtYears(rows, 20)).toEqual([1981, 1982]);
  });

  it('leaves out years whose growing season has a gap', () => {
    const rows = series((row, i) => {
      row.rootWetness = 0.5 + i / 100;
      if (i === 0 && row.month === 6) row.rootWetness = null;
    }, 10);
    // 9 complete years: nearest rank ceil(1.8) = 2 -> 1982, 1983
    expect(droughtYears(rows, 20)).toEqual([1982, 1983]);
  });
});

describe('droughtShare', () => {
  it('gives tied values at the limit fractional credit, so the share is exactly ceil(0.2 n)/n', () => {
    // 45 values: 5 below 0.30, then 10 tied at 0.30, then 30 above. Limit = 9th smallest = 0.30.
    const values = [...Array(5).fill(0.2), ...Array(10).fill(0.3), ...Array(30).fill(0.5)];
    expect(droughtShare(values, 20)).toBeCloseTo(9 / 45, 10);
  });
  it('is 9 of 45 for distinct values and null for no values', () => {
    expect(droughtShare(Array.from({ length: 45 }, (_, i) => i), 20)).toBeCloseTo(9 / 45, 10);
    expect(droughtShare([], 20)).toBeNull();
  });
});

describe('heat from daily maxima (D43)', () => {
  it('toMonthly attaches each month\'s daily maxima when the daily record is given, and [] for a month it lacks', () => {
    const power: PowerMonthly = {
      retrievedAt: '2026-11-14',
      units: {},
      months: [
        { year: 2001, month: 7, GWETROOT: 0.5, GWETTOP: 0.4, PRECTOTCORR: 2, T2M_MAX: 36, FROST_DAYS: 0, EVPTRNS: 0.49 },
        { year: 2001, month: 8, GWETROOT: 0.5, GWETTOP: 0.4, PRECTOTCORR: 2, T2M_MAX: 30, FROST_DAYS: 0, EVPTRNS: 0.49 },
      ],
    };
    const daily = new Map([[200107, [30, 36, null]]]);
    const m = toMonthly(power, daily);
    expect(m[0]!.tMaxDailyC).toEqual([30, 36, null]);
    expect(m[1]!.tMaxDailyC).toEqual([]);
    expect(toMonthly(power)[0]).not.toHaveProperty('tMaxDailyC');
  });

  it('a month counts as a heat month only with at least heatMinDays days above heatC', () => {
    // July: 3 hot days in years 0-8, 2 hot days in years 9-44
    const rows = series((row, i) => {
      if (row.month === 7) row.tMaxDailyC = [...Array<number>(i < 9 ? 3 : 2).fill(30), ...Array<number>(28).fill(20)];
    });
    expect(risk(rows, 7, 'heat').value).toBeCloseTo(9 / 45, 10);
    expect(risk(rows, 7, 'heat', { ...ALL, heatMinDays: 2 }).value).toBe(1);
  });

  it('throws on a heatMinDays that is not a whole number of at least 1, instead of marking every month', () => {
    for (const d of [0, 2.5, Number.NaN]) expect(() => monthlyRisk(series(), { ...ALL, heatMinDays: d }, SOURCE)).toThrow(/heatMinDays/);
  });

  it('a month whose daily list is empty is left out of the share', () => {
    const rows = series((row, i) => {
      if (row.month === 7) row.tMaxDailyC = i === 0 ? [] : [...Array<number>(i < 10 ? 3 : 0).fill(30), ...Array<number>(28).fill(20)];
    });
    expect(risk(rows, 7, 'heat').value).toBeCloseTo(9 / 44, 10);
  });
});
