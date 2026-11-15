import { describe, expect, it } from 'vitest';
import { iowaClimate, iowaSlope } from '../fixtures/analysis.iowa';
import { poznanClimate, poznanSlope } from '../fixtures/analysis.poznan';
import { fixtureCrops } from '../fixtures/crops';
import { engineRules, loadRules, shippedRules, toSoilRules, type RuleRow } from './rules';
import { soilHealth } from './soilHealth';
import goalsFile from '../../data/rules/goals.json';
import hazardsFile from '../../data/rules/hazards.json';

const row = (id: string, value: unknown) => ({
  id,
  value,
  unit: 'u',
  appliesTo: 'test',
  sourceTitle: 'test source',
  sourceUrl: 'https://example.org',
  sourceLocator: 'p. 1',
});

describe('loadRules', () => {
  it('has no rows of its own: without rule files there is nothing, and engineRules says which row is missing', () => {
    const loaded = loadRules({});
    expect(loaded.byId.size).toBe(0);
    expect(loaded.byFile).toEqual({});
    expect(() => engineRules(loaded)).toThrow(/hazards\.calendar\.markShare/);
  });

  it('reads every engine number from data/rules/goals.json and hazards.json', () => {
    const r = engineRules(shippedRules);
    const fileValue = (id: string) => [...(goalsFile as RuleRow[]), ...(hazardsFile as RuleRow[])].find((x) => x.id === id)?.value;
    expect(r.markShare).toBe(fileValue(r.ids.markShare));
    expect(r.droughtPercentile).toBe(fileValue(r.ids.drought));
    expect(r.heatMinDays).toBe(fileValue(r.ids.heatMinDays));
    expect(r.notSuitableBelowSI).toBe(fileValue(r.ids.gaez));
    expect(r.floorPoints).toBe(fileValue(r.ids.floor));
    expect(r.shownOthers).toBe(fileValue('goals.shownOthers.count'));
    expect(r.doublingFactor).toBe(fileValue('goals.priorityDoubling.factor'));
    for (const goal of ['keepSoil', 'improveSoil', 'income'] as const) expect(r.weights[goal]).toEqual(fileValue(r.ids.weights[goal]));
  });

  // #105 item 6: the water priority needs a seasonal need in mm per water need class, from a sourced row.
  describe('water need per class', () => {
    // built on the shipped rules without any water need row, so the cases hold whether or not data/rules has them
    const files = Object.fromEntries(
      Object.entries(shippedRules.byFile).map(([name, rows]) => [
        `../../data/rules/${name}.json`,
        (rows as { id: string }[]).filter((r) => !r.id.startsWith('water.needMm.')),
      ]),
    );
    const withRows = (rows: ReturnType<typeof row>[]) => loadRules({ ...files, '../../data/rules/zz-test.json': rows });
    const ids = ['water.needMm.low', 'water.needMm.medium', 'water.needMm.high'];

    it('is absent when data/rules has no water need rows', () => {
      const without = Object.fromEntries(
        Object.entries(files).map(([name, rows]) => [name, (rows as { id: string }[]).filter((r) => !r.id.startsWith('water.needMm.'))]),
      );
      const r = engineRules(loadRules(without));
      expect(r.waterNeedMm).toBeUndefined();
      expect(r.ids.waterNeed).toBeUndefined();
    });

    it('is present, with its rule ids, when data/rules has all three rows', () => {
      const r = engineRules(withRows([row(ids[0]!, 400), row(ids[1]!, 550), row(ids[2]!, 700)]));
      expect(r.waterNeedMm).toEqual({ low: 400, medium: 550, high: 700 });
      expect(r.ids.waterNeed).toEqual({ low: ids[0], medium: ids[1], high: ids[2] });
    });

    it('reads a need per crop next to the class rows, with its rule id', () => {
      const r = engineRules(withRows([row(ids[0]!, 400), row(ids[1]!, 550), row(ids[2]!, 700), row('water.needMm.maize', 650)]));
      expect(r.waterNeedByCropMm).toEqual({ maize: 650 });
      expect(r.waterNeedMm).toEqual({ low: 400, medium: 550, high: 700 });
    });

    it('throws when only some classes have a row, naming the missing one', () => {
      expect(() => engineRules(withRows([row(ids[0]!, 400), row(ids[2]!, 700)]))).toThrow(/water\.needMm\.medium/);
    });
  });

  it('keeps rows by file name, a later file wins on the same id', () => {
    const loaded = loadRules({
      '../../data/rules/goals.json': [row('goals.soilFloor.points', 7)],
      '../../data/rules/nitrogen.json': [row('nitrogen.credit.soybean', 30)],
    });
    expect(loaded.byId.get('goals.soilFloor.points')?.value).toBe(7);
    expect(loaded.byFile['nitrogen']?.map((r) => r.id)).toEqual(['nitrogen.credit.soybean']);
  });

  it('throws on a row without a source', () => {
    expect(() => loadRules({ '../../data/rules/x.json': [{ id: 'x', value: 1 }] })).toThrow(/x.json/);
  });
});

describe('toSoilRules on the rows in data/rules', () => {
  const loaded = shippedRules;
  const rowValue = (id: string) => loaded.byId.get(id)!.value as Record<string, number>;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const iowa = { monthly: iowaClimate.monthly, slopePct: iowaSlope };
  const find = (list: { id: string; value: unknown }[], id: string) => list.find((r) => r.id === id)?.value;

  it('converts Iowa nitrogen credits from lb N/acre to kg N/ha with a mid value', () => {
    const { rules, sourceIds } = toSoilRules(loaded, 'US', fixtureCrops.US, [{ crop: 'maize' }, { crop: 'soybean' }], iowa);
    const { low, high } = rowValue('nitrogen.credit.soybean.us-ia') as { low: number; high: number };
    const kg = 1.121; // lb N/acre to kg N/ha, as printed in the row's unit
    expect(find(rules.nitrogen, 'nitrogen.credit.soybean')).toEqual({ low: r3(low * kg), mid: r3(((low + high) / 2) * kg), high: r3(high * kg) });
    expect(sourceIds['nitrogen.credit.soybean']).toEqual(['nitrogen.credit.soybean.us-ia']);
    expect(find(rules.nitrogen, 'nitrogen.credit.field-pea')).toBeUndefined(); // Polish row, not for Iowa
  });

  it('uses the medium soil class for Polish humus coefficients and none for Iowa', () => {
    const pl = toSoilRules(loaded, 'PL', fixtureCrops.PL, [{ crop: 'maize' }, { crop: 'winter-wheat' }], { monthly: poznanClimate.monthly, slopePct: poznanSlope });
    expect(find(pl.rules.humus, 'humus.coef.maize')).toBe(rowValue('humus.coef.maize.pl').medium);
    expect(toSoilRules(loaded, 'US', fixtureCrops.US, [{ crop: 'maize' }], iowa).rules.humus).toEqual([]);
  });

  it('builds C factors per cover state, the slope table and a bare-fallow zero point', () => {
    const { rules, sourceIds } = toSoilRules(loaded, 'US', fixtureCrops.US, [{ crop: 'maize', coverCrop: 'cereal-rye' }, { crop: 'soybean' }], iowa);
    expect(find(rules.erosion, 'erosion.cFactor.bare')).toBe((loaded.byId.get('erosion.slr.bare')!.value as number) / 100);
    const stages = ['seedbed', 'establishment', 'development', 'maturing80', 'maturing90', 'maturing96'];
    const stageMean = (id: string) => mean(stages.map((k) => rowValue(id)[k]).filter((x): x is number => typeof x === 'number'));
    const maize = stageMean('erosion.slr.maize.conventional');
    const soy = stageMean('erosion.slr.soybean.conventional');
    expect(find(rules.erosion, 'erosion.cFactor.crop')).toBeCloseTo((maize + soy) / 200, 3);
    const residue = rowValue('erosion.slr.residueCover.maize').tilled30! + rowValue('erosion.slr.residueCover.soybean').tilled30!;
    expect(find(rules.erosion, 'erosion.cFactor.residue')).toBeCloseTo(residue / 200, 3);
    expect(find(rules.erosion, 'erosion.cFactor.cover-crop')).toBeCloseTo(mean(Object.values(rowValue('erosion.slr.maize.noTillInRyeCover'))) / 100, 3);
    expect(typeof find(rules.erosion, 'erosion.zeroScoreIndex')).toBe('number');
    expect(sourceIds['erosion.zeroScoreIndex']).toContain('erosion.slr.bare');
  });

  // #105 item 5: the zero point is bare fallow on the RUSLE unit plot (LS = 1, the row's unit text), so the field's
  // slope factor moves the erosion score instead of cancelling out.
  it('a steeper field scores lower on erosion: the zero point is bare fallow on the unit plot, LS = 1', () => {
    const years = [{ crop: 'maize' }, { crop: 'soybean' }];
    const erosionAt = (pct: number) => {
      const slopePct = { ...iowaSlope, value: pct };
      const { rules } = toSoilRules(loaded, 'US', fixtureCrops.US, years, { monthly: iowaClimate.monthly, slopePct });
      const profile = { ...iowaClimate, soil: { sandPct: iowaSlope, clayPct: iowaSlope, organicCarbon: iowaSlope, ph: iowaSlope }, slopePct };
      return { rules, score: soilHealth(years, fixtureCrops.US, profile, rules, { goal: 'keepSoil', on: [], excludedCrops: [] }).indicators.erosion!.value };
    };
    const flat = erosionAt(1);
    const steep = erosionAt(12);
    expect(steep.score).toBeLessThan(flat.score);
    expect(find(flat.rules.erosion, 'erosion.zeroScoreIndex')).toBe(find(steep.rules.erosion, 'erosion.zeroScoreIndex'));
    const zeroRow = flat.rules.erosion.find((r) => r.id === 'erosion.zeroScoreIndex')!;
    expect(`${zeroRow.unit} ${zeroRow.appliesTo}`).toMatch(/unit plot/);
    expect(`${zeroRow.unit} ${zeroRow.appliesTo}`).not.toMatch(/this field/);
  });

  // #124 review item 2: after its last cut the alfalfa stand stays in the ground until the next crop is sown, so its
  // residue months use the same established-meadow full-year value (AH 537 Table 5-B) as its crop months.
  it('gives an alfalfa rotation erosion C factors, the stand counting as meadow until the next crop', () => {
    const { rules, sourceIds, erosionNoRow } = toSoilRules(loaded, 'US', fixtureCrops.US, [{ crop: 'alfalfa' }, { crop: 'maize' }], iowa);
    const meadow = rowValue('erosion.slr.meadow').alfalfa!;
    const maizeResidue = rowValue('erosion.slr.residueCover.maize').tilled30!;
    expect(find(rules.erosion, 'erosion.cFactor.residue')).toBeCloseTo((meadow + maizeResidue) / 200, 3);
    expect(sourceIds['erosion.cFactor.residue']).toContain('erosion.slr.meadow');
    expect(erosionNoRow).not.toContain('alfalfa');
  });

  // D54: field pea and winter rapeseed have no C factor by crop stage, only an IUNG annual value (Polish USLE model).
  it('uses the annual C factor for a main crop with no stage rows, for its crop and residue months, and names it', () => {
    const { rules, sourceIds, erosionNoRow, erosionAnnual } = toSoilRules(loaded, 'PL', fixtureCrops.PL, [{ crop: 'field-pea' }, { crop: 'winter-wheat' }], {
      monthly: poznanClimate.monthly,
      slopePct: poznanSlope,
    });
    const annual = loaded.byId.get('erosion.cAnnual.field-pea.pl')!.value as number;
    expect(erosionNoRow).not.toContain('field-pea');
    expect(erosionAnnual).toEqual(['field-pea']);
    expect(sourceIds['erosion.cFactor.crop']).toContain('erosion.cAnnual.field-pea.pl');
    expect(sourceIds['erosion.cFactor.residue']).toContain('erosion.cAnnual.field-pea.pl');
    expect(find(rules.erosion, 'erosion.cFactor.crop')).toBeDefined();
    expect(find(rules.erosion, 'erosion.cFactor.residue')).toBeDefined();
    expect(annual).toBeGreaterThan(0);
  });

  it('does not use a Polish annual C factor on a US field', () => {
    const { erosionAnnual } = toSoilRules(loaded, 'US', fixtureCrops.US, [{ crop: 'maize' }], iowa);
    expect(erosionAnnual).toEqual([]);
  });

  it('leaves erosion C factors out for a cover crop without a row', () => {
    const { rules, erosionNoRow } = toSoilRules(loaded, 'PL', fixtureCrops.PL, [{ crop: 'winter-wheat', coverCrop: 'white-mustard' }, { crop: 'maize' }], {
      monthly: poznanClimate.monthly,
      slopePct: poznanSlope,
    });
    expect(find(rules.erosion, 'erosion.cFactor.cover-crop')).toBeUndefined();
    expect(erosionNoRow).toContain('white-mustard');
  });

  it('gives each family a minimum return from its crop rows, else the any-family row', () => {
    const { rules, sourceIds } = toSoilRules(loaded, 'US', fixtureCrops.US, [{ crop: 'maize' }], iowa);
    const lowOf = (v: unknown) => (typeof v === 'number' ? v : (v as { low: number }).low);
    const highOf = (v: unknown) => (typeof v === 'number' ? v : (v as { high: number }).high);
    for (const family of new Set(fixtureCrops.US.map((c) => c.family))) {
      const from = sourceIds[`pestBreak.minReturn.${family}`]!;
      expect(from.length).toBeGreaterThan(0);
      const values = from.map((id) => loaded.byId.get(id)!.value);
      const low = Math.max(...values.map(lowOf));
      expect(find(rules.pestBreak, `pestBreak.minReturn.${family}`)).toEqual(
        from[0] === 'pestBreak.returnYears.anyFamily' ? low : { low, mid: low, high: Math.max(low, ...values.map(highOf)) },
      );
    }
  });

  it('lets soilHealth score nitrogen, erosion and pest break for the Iowa current rotation', () => {
    const years = [{ crop: 'maize' }, { crop: 'soybean' }];
    const { rules } = toSoilRules(loaded, 'US', fixtureCrops.US, years, iowa);
    const profile = { ...iowaClimate, soil: { sandPct: iowaSlope, clayPct: iowaSlope, organicCarbon: iowaSlope, ph: iowaSlope }, slopePct: iowaSlope };
    const r = soilHealth(years, fixtureCrops.US, profile, rules, { goal: 'keepSoil', on: [], excludedCrops: [] });
    expect(Object.keys(r.indicators).sort()).toEqual(['erosion', 'nitrogen', 'pestBreak']);
    expect(r.missing).toEqual(['organicMatter']);
  });

  it('credits a perennial legume once per stand, not once per year', () => {
    const profile = { ...iowaClimate, soil: { sandPct: iowaSlope, clayPct: iowaSlope, organicCarbon: iowaSlope, ph: iowaSlope }, slopePct: iowaSlope };
    const nitrogenOf = (years: { crop: string }[]) => {
      const { rules } = toSoilRules(loaded, 'US', fixtureCrops.US, years, iowa);
      return soilHealth(years, fixtureCrops.US, profile, rules, { goal: 'keepSoil', on: [], excludedCrops: [] }).indicators.nitrogen!.value;
    };
    const two = nitrogenOf([{ crop: 'alfalfa' }, { crop: 'alfalfa' }, { crop: 'maize' }]);
    const three = nitrogenOf([{ crop: 'alfalfa' }, { crop: 'alfalfa' }, { crop: 'alfalfa' }, { crop: 'maize' }]);
    expect(three).toBeLessThanOrEqual(two);
  });
});
