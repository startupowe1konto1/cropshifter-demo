import type { Analysis, GoalId, Message, Priorities } from '../contracts';
import { analysis as analysisSchema, climateProfile, cropTraits, dataset, field as fieldSchema } from '../contracts/schemas';
import {
  buildCalendar,
  buildClimate,
  createRandom,
  demoFields,
  fixtureAnalyzeField,
  fixtureCrops,
  fixtureDatasets,
  fixtureMessages,
  fixtureProviders,
  iowaAnalysis,
  poznanAnalysis,
} from './index';

const analyses: [string, Analysis][] = [
  ['Iowa', iowaAnalysis],
  ['Poznań', poznanAnalysis],
];
const messages: Record<string, string> = fixtureMessages;
const SOIL_GOALS: GoalId[] = ['keepSoil', 'improveSoil'];

/** Every object found anywhere inside `root` that passes `test`. */
function collect<T>(root: unknown, test: (node: Record<string, unknown>) => boolean): T[] {
  const found: T[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node !== null && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if (test(record)) found.push(record as T);
      Object.values(record).forEach(walk);
    }
  };
  walk(root);
  return found;
}
const collectMessages = (root: unknown) => collect<Message>(root, (node) => typeof node.code === 'string');
const collectSourced = (root: unknown) =>
  collect<{ value: unknown; datasetIds: string[]; retrievedAt: string; missingReason?: string }>(
    root,
    (node) => 'value' in node && Array.isArray(node.datasetIds),
  );

describe('fixture building blocks', () => {
  it('has a repeatable random generator', () => {
    const a = createRandom(7);
    const b = createRandom(7);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true);
  });

  it('builds a 45-year climate record that parses', () => {
    const climate = buildClimate(1);
    const parsed = climateProfile.safeParse(climate);
    expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 5), null, 2)).toBe(true);
    expect(climate.monthly).toHaveLength(540);
    expect(climate.monthlyRisk).toHaveLength(36);
    expect(climate.yearly).toHaveLength(45);
    expect(climate.trends).toHaveLength(2);
    expect(climate.droughtYears.length).toBeGreaterThanOrEqual(3);
    expect(climate.droughtYears.length).toBeLessThanOrEqual(6);
    for (const risk of climate.monthlyRisk) {
      expect(risk.probability.value).toBeGreaterThanOrEqual(0);
      expect(risk.probability.value).toBeLessThanOrEqual(1);
      expect(risk.probability.kind).toBe('derived');
      expect(risk.probability.datasetIds).toContain('nasa-power-monthly');
    }
    expect(buildClimate(1)).toEqual(climate);
  });

  it('wraps a winter crop over the year boundary and counts residue before bare soil', () => {
    const risk = buildClimate(1).monthlyRisk;
    const calendar = buildCalendar([{ crop: 'maize' }, { crop: 'soybean' }, { crop: 'winter-wheat' }], fixtureCrops.US, risk);
    expect(calendar).toHaveLength(36);
    const cell = (yearIndex: number, month: number) => calendar.find((m) => m.yearIndex === yearIndex && m.month === month);
    expect(cell(1, 10)).toMatchObject({ crop: 'soybean', cover: 'crop' }); // soybean is still on the field in October
    expect(cell(1, 12)).toMatchObject({ crop: 'winter-wheat', cover: 'crop' }); // wheat of year 3 is sown in year 2
    expect(cell(2, 7)).toMatchObject({ crop: 'winter-wheat', cover: 'crop' });
    expect(cell(2, 8)?.cover).toBe('residue');
    expect(cell(2, 12)?.cover).toBe('bare');
    expect(cell(0, 12)?.cover).toBe('residue'); // maize stalks
    expect(cell(0, 7)?.exposure.map((e) => e.hazard).sort()).toEqual(['drought', 'heat']);
    expect(cell(0, 6)?.exposure).toEqual([]); // maize is not sensitive in June
    expect(cell(2, 9)?.exposure).toEqual([]); // nothing in the ground
  });

  it('puts a cover crop in the months the main crop leaves free', () => {
    const risk = buildClimate(1).monthlyRisk;
    const calendar = buildCalendar([{ crop: 'maize', coverCrop: 'cereal-rye' }, { crop: 'soybean' }], fixtureCrops.US, risk);
    const rye = calendar.filter((m) => m.cover === 'cover-crop');
    expect(rye.map((m) => `${m.yearIndex}-${m.month}`)).toEqual(['0-11', '0-12', '1-1', '1-2', '1-3', '1-4']);
    expect(rye.every((m) => m.crop === 'cereal-rye')).toBe(true);
  });
});

describe('fixture tables', () => {
  it('has demo fields that parse, with closed rings', () => {
    for (const demo of Object.values(demoFields)) {
      const parsed = fieldSchema.safeParse(demo);
      expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 5), null, 2)).toBe(true);
      const ring = demo.polygon.coordinates[0] ?? [];
      expect(ring).toHaveLength(5);
      expect(ring[0]).toEqual(ring[4]);
    }
    expect(demoFields.poznan.parcelIds).toEqual(['302116_5.0008.428/1']);
  });

  it('has crops that parse and carry only the placeholder source', () => {
    const all = [...fixtureCrops.US, ...fixtureCrops.PL];
    expect(fixtureCrops.US.map((c) => c.id)).toEqual(['maize', 'soybean', 'oats', 'winter-wheat', 'alfalfa', 'cereal-rye', 'red-clover']);
    expect(fixtureCrops.PL).toHaveLength(10);
    for (const crop of all) {
      const parsed = cropTraits.safeParse(crop);
      expect(parsed.success, `${crop.id}: ${JSON.stringify(parsed.error?.issues.slice(0, 5), null, 2)}`).toBe(true);
      expect(crop.sources).toEqual([
        { title: 'Fixture value, not sourced', url: 'https://example.org/fixture', locator: 'placeholder until task O4-A2' },
      ]);
    }
  });

  it('has datasets that parse and cover every dataset id used in the analyses', () => {
    for (const row of fixtureDatasets) expect(dataset.safeParse(row).success, row.id).toBe(true);
    const known = new Set(fixtureDatasets.map((d) => d.id));
    for (const [, analysis] of analyses) {
      const used = new Set(collectSourced(analysis).flatMap((s) => s.datasetIds));
      for (const id of [...used, ...analysis.profile.source.datasetIds]) expect(known.has(id), id).toBe(true);
    }
  });
});

describe.each(analyses)('%s fixture analysis', (_name, analysis) => {
  const { rotations, shownByGoal } = analysis;

  it('parses with the analysis schema', () => {
    const parsed = analysisSchema.safeParse(analysis);
    expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 5), null, 2)).toBe(true);
  });

  it('has five rotations and exactly one current one', () => {
    expect(rotations).toHaveLength(5);
    expect(new Set(rotations.map((r) => r.id)).size).toBe(5);
    expect(rotations.filter((r) => r.isCurrent)).toHaveLength(1);
  });

  it('has a text for every message code, with every placeholder filled', () => {
    const used = collectMessages(analysis);
    expect(used.length).toBeGreaterThan(50);
    for (const message of used) {
      expect(message.code.startsWith('fx.'), message.code).toBe(true);
      const template = messages[message.code];
      expect(template, `no text for ${message.code}`).toBeTypeOf('string');
      for (const [, param] of (template ?? '').matchAll(/\{(\w+)\}/g)) {
        expect(message.params, `${message.code} needs {${param}}`).toHaveProperty(param ?? '');
      }
    }
  });

  it('marks every value as fixture data, dated, and gives a reason when it is missing', () => {
    const values = collectSourced(analysis);
    expect(values.length).toBeGreaterThan(200);
    for (const value of values) {
      expect(value.datasetIds).toContain('fixture');
      expect(value.retrievedAt).toBe('2026-11-14');
      if (value.value === null) expect(value.missingReason).toBeTruthy();
    }
    expect(analysis.generatedAt).toBe('2026-11-14');
  });

  it('ranks the five rotations 1 to 5 under both soil goals, in a different order', () => {
    const order = (goal: GoalId) => [...rotations].sort((a, b) => (a.rankByGoal[goal] ?? 0) - (b.rankByGoal[goal] ?? 0)).map((r) => r.id);
    for (const goal of SOIL_GOALS) {
      expect(rotations.map((r) => r.rankByGoal[goal]).sort()).toEqual([1, 2, 3, 4, 5]);
      expect(rotations.every((r) => r.totals[goal].status === 'ready')).toBe(true);
    }
    expect(order('keepSoil')).not.toEqual(order('improveSoil'));
    expect(rotations.every((r) => r.rankByGoal.income === undefined)).toBe(true);
  });

  it('has no income, twins or money data yet', () => {
    for (const r of rotations) {
      expect(r.totals.income).toEqual({ status: 'no-data', reason: { code: 'fx.income.not-loaded' } });
      expect(r.income).toEqual({ status: 'no-data', reason: { code: 'fx.income.not-loaded' } });
      expect(r.twins).toEqual({ status: 'no-data', reason: { code: 'fx.twins.not-loaded' } });
      expect(r.money).toEqual({ status: 'not-loaded' });
    }
  });

  it('puts exactly one alternative below the soil floor, and it really is more than 5 points down', () => {
    const current = rotations.find((r) => r.isCurrent);
    const below = rotations.filter((r) => r.belowSoilFloor);
    expect(below).toHaveLength(1);
    expect(below[0]?.isCurrent).toBe(false);
    for (const r of rotations) {
      expect(r.belowSoilFloor).toBe(!r.isCurrent && r.soilHealth.value < (current?.soilHealth.value ?? 0) - 5);
    }
  });

  it('shows the three best alternatives and the current rotation under each soil goal, best first', () => {
    expect(Object.keys(shownByGoal).sort()).toEqual(['improveSoil', 'keepSoil']);
    const byId = new Map(rotations.map((r) => [r.id, r]));
    for (const goal of SOIL_GOALS) {
      const ids = shownByGoal[goal] ?? [];
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(4);
      const shown = ids.map((id) => byId.get(id));
      expect(shown.every((r) => r !== undefined), `${goal}: unknown id in ${ids.join(', ')}`).toBe(true);
      expect(shown.filter((r) => r?.isCurrent)).toHaveLength(1);
      const ranks = shown.map((r) => r?.rankByGoal[goal] ?? 0);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      const eligible = rotations.filter((r) => !r.isCurrent && !(goal === 'keepSoil' && r.belowSoilFloor));
      const best = eligible.sort((a, b) => (a.rankByGoal[goal] ?? 0) - (b.rankByGoal[goal] ?? 0)).slice(0, 3);
      for (const r of best) expect(ids).toContain(r.id);
    }
    expect((shownByGoal.keepSoil ?? []).some((id) => byId.get(id)?.belowSoilFloor)).toBe(false);
    // Every rotation in the analysis is shown under at least one goal.
    const shownSomewhere = new Set([...(shownByGoal.keepSoil ?? []), ...(shownByGoal.improveSoil ?? [])]);
    expect([...shownSomewhere].sort()).toEqual(rotations.map((r) => r.id).sort());
  });

  it('gives every rotation the card content the UI needs', () => {
    for (const r of rotations) {
      expect(r.why.length, r.id).toBeGreaterThanOrEqual(2);
      expect(r.why.length, r.id).toBeLessThanOrEqual(3);
      expect(r.evidence, r.id).toHaveLength(2);
      for (const evidence of r.evidence) {
        expect(evidence.values.length).toBeGreaterThanOrEqual(1);
        expect(evidence.values.length).toBeLessThanOrEqual(2);
        expect(evidence.ruleIds.length).toBeGreaterThanOrEqual(1);
        expect(evidence.ruleIds.every((id) => id.startsWith('fixture.rule.'))).toBe(true);
      }
      expect(r.benefits, r.id).toHaveLength(2);
      expect(r.gaps.length, r.id).toBeGreaterThanOrEqual(1);
      expect(r.gaps, r.id).toHaveLength(2);
      expect(r.localReviewRisks.length, r.id).toBeGreaterThanOrEqual(1);
      expect(r.localReviewRisks, r.id).toHaveLength(2);
      expect(Object.keys(r.priorityScores).sort()).toEqual(['forage', 'water']);
    }
  });

  it('has a weak score somewhere, and a weak rotation names the reason first in its gaps', () => {
    const weak = rotations.filter((r) => r.climateResilience.confidence === 'weak');
    expect(weak.length).toBeGreaterThanOrEqual(1);
    for (const r of weak) expect(r.gaps[0]?.code.startsWith('fx.gap.weak.')).toBe(true);
    const confidences = new Set(rotations.map((r) => r.climateResilience.confidence));
    expect(confidences.size).toBeGreaterThanOrEqual(2);
  });

  it('has a calendar of 12 months per rotation year, with bare months counted from it', () => {
    for (const r of rotations) {
      expect(r.calendar, r.id).toHaveLength(r.years.length * 12);
      expect(r.bareMonths, r.id).toBe(r.calendar.filter((m) => m.cover === 'bare').length);
      r.calendar.forEach((m, index) => {
        expect(m.yearIndex).toBe(Math.floor(index / 12));
        expect(m.month).toBe((index % 12) + 1);
        if (m.cover === 'crop' || m.cover === 'cover-crop') expect(m.crop).toBeTruthy();
        else {
          expect(m.crop).toBeUndefined();
          expect(m.exposure).toEqual([]);
        }
      });
      for (const year of r.years) expect(r.calendar.some((m) => m.crop === year.crop && m.cover === 'crop'), `${r.id}: ${year.crop}`).toBe(true);
      for (const year of r.years) {
        if (year.coverCrop) expect(r.calendar.some((m) => m.crop === year.coverCrop && m.cover === 'cover-crop'), r.id).toBe(true);
      }
      expect(r.calendar.some((m) => m.exposure.length > 0), r.id).toBe(true);
    }
  });
});

describe('fixture specifics', () => {
  it('uses the right soil source per field and leaves the Poznań slope missing', () => {
    expect(iowaAnalysis.profile.soil.organicCarbon.datasetIds).toContain('usda-ssurgo');
    expect(poznanAnalysis.profile.soil.organicCarbon.datasetIds).toContain('isric-soilgrids');
    expect(iowaAnalysis.profile.slopePct.datasetIds).toContain('nasadem');
    expect(iowaAnalysis.profile.slopePct.value).toBeTypeOf('number');
    expect(poznanAnalysis.profile.slopePct).toMatchObject({ value: null, missingReason: 'slope not precomputed for this field' });
  });

  it('has the current rotations the demo expects', () => {
    expect(iowaAnalysis.rotations.find((r) => r.isCurrent)?.years).toEqual([{ crop: 'maize' }, { crop: 'soybean' }]);
    expect(poznanAnalysis.rotations.find((r) => r.isCurrent)?.years).toEqual([
      { crop: 'winter-wheat' },
      { crop: 'winter-rapeseed' },
      { crop: 'winter-wheat' },
    ]);
    // The text for the Poznań current rotation says no month is bare.
    expect(poznanAnalysis.rotations.find((r) => r.isCurrent)?.bareMonths).toBe(0);
  });

  it('uses only crops from the country list', () => {
    const check = (analysis: Analysis, ids: string[]) => {
      for (const r of analysis.rotations) {
        for (const year of r.years) {
          expect(ids).toContain(year.crop);
          if (year.coverCrop) expect(ids).toContain(year.coverCrop);
        }
      }
    };
    check(iowaAnalysis, fixtureCrops.US.map((c) => c.id));
    check(poznanAnalysis, fixtureCrops.PL.map((c) => c.id));
  });

  it('has no message text that nothing uses, and no em dashes', () => {
    const used = new Set([...collectMessages(iowaAnalysis), ...collectMessages(poznanAnalysis)].map((m) => m.code));
    used.add('fx.history.none'); // returned by the provider, not part of an analysis
    for (const [code, text] of Object.entries(messages)) {
      expect(used.has(code), `unused text ${code}`).toBe(true);
      expect(text).not.toMatch(/—/);
    }
  });
});

describe('fixture providers', () => {
  it('returns the input field from fixtureAnalyzeField', async () => {
    const field = { ...demoFields.iowa, id: 'my-field', name: 'My field' };
    const priorities: Priorities = { goal: 'keepSoil', on: [], excludedCrops: [] };
    const started = Date.now();
    const result = await fixtureAnalyzeField({ field, cropHistory: [], priorities }, fixtureProviders);
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    expect(result.field).toBe(field);
    expect(result.rotations).toBe(iowaAnalysis.rotations);

    const other = { ...demoFields.poznan, country: 'OTHER' as const };
    const elsewhere = await fixtureAnalyzeField({ field: other, cropHistory: [], priorities }, fixtureProviders);
    expect(elsewhere.field).toBe(other);
    expect(elsewhere.rotations).toBe(poznanAnalysis.rotations);
    expect(analysisSchema.safeParse(elsewhere).success).toBe(true);
  });

  it('serves climate, crops, history, soil and slope by country', async () => {
    const { profile, context, twins, money } = fixtureProviders;
    expect((await profile.getClimate(demoFields.iowa)).monthly).toBe(iowaAnalysis.profile.monthly);
    expect((await profile.getClimate(demoFields.poznan)).monthly).toBe(poznanAnalysis.profile.monthly);

    expect(await context.getCrops('US')).toBe(fixtureCrops.US);
    expect(await context.getCrops('PL')).toBe(fixtureCrops.PL);
    expect(await context.getCrops('OTHER')).toEqual([]);

    const history = await context.getCropHistory(demoFields.iowa);
    expect(history.status).toBe('ready');
    if (history.status === 'ready') {
      expect(history.data.map((y) => y.year)).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025]);
      expect(history.data.map((y) => y.crop)).toEqual(['soybean', 'maize', 'soybean', 'maize', 'soybean', 'maize', 'soybean']);
      expect(history.data.every((y) => y.source === 'cropscape')).toBe(true);
    }
    expect(await context.getCropHistory(demoFields.poznan)).toEqual({ status: 'no-data', reason: { code: 'fx.history.none' } });

    const suitability = await context.getSuitability(demoFields.poznan, ['rye', 'pineapple']);
    expect(suitability.rye).toMatchObject({ value: 80, kind: 'model' });
    expect(suitability.rye?.datasetIds).toEqual(['fao-gaez-v4', 'fixture']);
    expect(suitability.pineapple?.value).toBeNull();
    expect(suitability.pineapple?.missingReason).toBeTruthy();

    expect(await context.getSoil(demoFields.iowa)).toBe(iowaAnalysis.profile.soil);
    expect(await context.getSlope(demoFields.poznan)).toBe(poznanAnalysis.profile.slopePct);

    const rotation = iowaAnalysis.rotations[0]?.years ?? [];
    expect(await twins.getTwins(demoFields.iowa, iowaAnalysis.profile, rotation)).toEqual({ status: 'no-data', reason: { code: 'fx.twins.not-loaded' } });
    expect(await money.getEconomics(demoFields.iowa, ['maize'])).toEqual({ status: 'not-loaded' });
    expect(await money.getPayments(demoFields.iowa, rotation)).toEqual({ status: 'not-loaded' });
  });
});
