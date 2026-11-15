import { describe, expect, it } from 'vitest';
import cropsPlFile from '../../data/crops/pl.json';
import cropsUsFile from '../../data/crops/us-ia.json';
import type { CropTraits, CropYear, Priorities, RotationOption } from '../contracts';
import { fixtureCrops } from '../fixtures/crops';
import { buildCalendar, canFollow, cropById } from './calendar';
import { MAX_CANDIDATES, coverFits, currentRotation, generateCandidates } from './candidates';

const us = fixtureCrops.US;
const pl = fixtureCrops.PL;
type Years = RotationOption['years'];

const history = (crops: string[], from = 2019): CropYear[] =>
  crops.map((crop, i) => ({ year: from + i, crop, source: 'cropscape' }));

const priorities = (excludedCrops: string[] = []): Priorities => ({ goal: 'keepSoil', on: [], excludedCrops });

// canonical form of a rotation: the smallest rotation of the cycle, serialized
const key = (years: Years) => {
  const parts = years.map((y) => `${y.crop}+${y.coverCrop ?? ''}`);
  let best = '';
  for (let s = 0; s < parts.length; s++) {
    const k = [...parts.slice(s), ...parts.slice(0, s)].join('|');
    if (best === '' || k < best) best = k;
  }
  return best;
};
const has = (list: Years[], years: Years) => list.some((c) => key(c) === key(years));

const iowaHistory = history(['maize', 'soybean', 'maize', 'soybean', 'maize', 'soybean', 'maize']);
const poznanCurrent: Years = [
  { crop: 'winter-wheat' },
  { crop: 'winter-rapeseed' },
  { crop: 'winter-wheat' },
  { crop: 'spring-barley' },
];

describe('currentRotation', () => {
  it('finds a 4-year cycle in a 7-year history', () => {
    const crops = ['winter-wheat', 'winter-rapeseed', 'winter-wheat', 'spring-barley', 'winter-wheat', 'winter-rapeseed', 'winter-wheat'];
    const history = crops.map((crop, i) => ({ year: 2019 + i, crop, source: 'farmer' as const }));
    expect(currentRotation(history).map((y) => y.crop)).toEqual(['spring-barley', 'winter-wheat', 'winter-rapeseed', 'winter-wheat']);
  });

  it('maize, soybean, maize, soybean returns the two-year cycle', () => {
    expect(currentRotation(history(['maize', 'soybean', 'maize', 'soybean']))).toEqual([
      { crop: 'maize' },
      { crop: 'soybean' },
    ]);
  });

  it('three different crops return the sequence as entered', () => {
    expect(currentRotation(history(['maize', 'soybean', 'oats']))).toEqual([
      { crop: 'maize' },
      { crop: 'soybean' },
      { crop: 'oats' },
    ]);
  });

  it('sorts by year before looking for the cycle and returns the last cycle', () => {
    const shuffled = [...iowaHistory].reverse();
    expect(currentRotation(shuffled)).toEqual([{ crop: 'soybean' }, { crop: 'maize' }]);
  });

  it('keeps cover crops of the returned years', () => {
    const h: CropYear[] = [
      { year: 2020, crop: 'maize', coverCrop: 'cereal-rye', source: 'farmer' },
      { year: 2021, crop: 'soybean', source: 'farmer' },
      { year: 2022, crop: 'maize', coverCrop: 'cereal-rye', source: 'farmer' },
      { year: 2023, crop: 'soybean', source: 'farmer' },
    ];
    expect(currentRotation(h)).toEqual([{ crop: 'maize', coverCrop: 'cereal-rye' }, { crop: 'soybean' }]);
  });

  it('continuous maize is a one-year cycle; empty history is empty', () => {
    expect(currentRotation(history(['maize', 'maize', 'maize']))).toEqual([{ crop: 'maize' }]);
    expect(currentRotation([])).toEqual([]);
  });

  it('two years of maize are a one-year cycle', () => {
    expect(currentRotation(history(['maize', 'maize']))).toEqual([{ crop: 'maize' }]);
  });

  it('maize, soybean, maize is the two-year cycle, not maize followed by maize', () => {
    expect(currentRotation(history(['maize', 'soybean', 'maize']))).toEqual([{ crop: 'soybean' }, { crop: 'maize' }]);
  });

  it('a history that starts and ends with the same crop drops the repeated year instead of wrapping it into itself', () => {
    expect(currentRotation(history(['maize', 'soybean', 'oats', 'maize']))).toEqual([
      { crop: 'soybean' },
      { crop: 'oats' },
      { crop: 'maize' },
    ]);
  });

  it('keeps a self-follow that the farmer actually grew', () => {
    expect(currentRotation(history(['maize', 'maize', 'soybean']))).toEqual([
      { crop: 'maize' },
      { crop: 'maize' },
      { crop: 'soybean' },
    ]);
  });
});

const realUs = cropsUsFile as CropTraits[];
const realPl = cropsPlFile as CropTraits[];
const t = (crops: CropTraits[], id: string) => cropById(crops, id);
const custom = (row: Pick<CropTraits, 'id' | 'sowMonth' | 'harvestMonth'>): CropTraits => ({
  ...t(us, 'red-clover'),
  ...row,
});

describe('coverFits', () => {
  it('accepts a cover sown into the previous crop, as calendar.ts does (interseeding)', () => {
    expect(coverFits(t(realUs, 'maize'), t(realUs, 'cereal-rye'), t(realUs, 'soybean'))).toBe(true);
    expect(coverFits(t(realUs, 'soybean'), t(realUs, 'red-clover'), t(realUs, 'maize'))).toBe(true);
  });

  it('accepts a cover sown in or after the harvest month', () => {
    expect(coverFits(t(realPl, 'winter-wheat'), t(realPl, 'white-mustard'), t(realPl, 'maize'))).toBe(true);
  });

  it('rejects a cover sown before the previous crop is in the ground', () => {
    const early = custom({ id: 'early', sowMonth: 3, harvestMonth: 6 });
    expect(coverFits(t(us, 'oats'), early, t(us, 'maize'))).toBe(false);
  });

  it('rejects an interseeded cover that ends before the main crop is harvested', () => {
    const short = custom({ id: 'short', sowMonth: 6, harvestMonth: 9 });
    expect(coverFits(t(us, 'maize'), short, t(us, 'soybean'))).toBe(false);
  });

  it('rejects a cover still in the ground when the next winter crop is sown', () => {
    expect(coverFits(t(realUs, 'maize'), t(realUs, 'cereal-rye'), t(realUs, 'winter-wheat'))).toBe(false);
  });
});

describe('generateCandidates on the real crop tables', () => {
  const share = (list: Years[]) => list.filter((c) => c.some((y) => y.coverCrop !== undefined)).length / list.length;

  it('Iowa: cover variants exist and make up at least 20% of the list', () => {
    const list = generateCandidates(currentRotation(iowaHistory), realUs, priorities());
    expect(list.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    expect(has(list, [{ crop: 'maize', coverCrop: 'cereal-rye' }, { crop: 'soybean' }])).toBe(true);
    expect(has(list, [{ crop: 'maize' }, { crop: 'soybean', coverCrop: 'red-clover' }])).toBe(true);
    expect(share(list)).toBeGreaterThanOrEqual(0.2);
  });

  it('Poland: cover variants exist and make up at least 20% of the list', () => {
    const current: Years = [{ crop: 'winter-wheat' }, { crop: 'maize' }, { crop: 'winter-wheat' }, { crop: 'sugar-beet' }];
    const list = generateCandidates(current, realPl, priorities());
    expect(list.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    expect(list.some((c) => c.some((y) => y.crop === 'winter-wheat' && y.coverCrop === 'white-mustard'))).toBe(true);
    expect(share(list)).toBeGreaterThanOrEqual(0.2);
  });
});

describe('generateCandidates', () => {
  const current = currentRotation(iowaHistory);
  const iowa = generateCandidates(current, us, priorities());

  it('puts the current rotation first', () => {
    expect(iowa[0]).toEqual(current);
  });

  it('includes the cover crop, small grain and legume one-step variants', () => {
    expect(has(iowa, [{ crop: 'maize', coverCrop: 'cereal-rye' }, { crop: 'soybean' }])).toBe(true);
    expect(has(iowa, [{ crop: 'maize' }, { crop: 'soybean', coverCrop: 'cereal-rye' }])).toBe(true);
    expect(has(iowa, [{ crop: 'maize' }, { crop: 'soybean' }, { crop: 'oats' }])).toBe(true);
    expect(has(iowa, [{ crop: 'maize' }, { crop: 'soybean' }, { crop: 'winter-wheat' }])).toBe(true);
    expect(has(iowa, [{ crop: 'maize' }, { crop: 'alfalfa' }, { crop: 'soybean' }])).toBe(true);
    // replace one year
    expect(has(iowa, [{ crop: 'maize' }, { crop: 'oats' }])).toBe(true);
  });

  it('accepts a cover sown into the standing crop (red clover sown in August under maize harvested in October)', () => {
    expect(iowa.some((c) => c.some((y) => y.crop === 'maize' && y.coverCrop === 'red-clover'))).toBe(true);
  });

  it('includes enumerated rotations of two to five years', () => {
    const lengths = new Set(iowa.map((c) => c.length));
    for (const n of [2, 3, 4]) expect(lengths.has(n)).toBe(true);
    // five-year rotations are present when the cap leaves room, e.g. with fewer crops
    const few = us.filter((c) => ['maize', 'soybean', 'oats', 'cereal-rye'].includes(c.id));
    const small = generateCandidates([{ crop: 'maize' }, { crop: 'soybean' }], few, priorities());
    expect(small.some((c) => c.length === 5)).toBe(true);
    expect(small.every((c) => c.every((y) => y.crop !== 'cereal-rye'))).toBe(true);
  });

  it('never uses a cover crop as a main crop', () => {
    expect(iowa.slice(1).every((c) => c.every((y) => cropById(us, y.crop).kind !== 'cover'))).toBe(true);
  });

  it('excludes excluded crops, main or cover, but keeps the current rotation', () => {
    const list = generateCandidates(current, us, priorities(['oats', 'cereal-rye', 'maize']));
    expect(list[0]).toEqual(current);
    const used = list.slice(1).flatMap((c) => c.flatMap((y) => [y.crop, y.coverCrop]));
    expect(used).not.toContain('oats');
    expect(used).not.toContain('cereal-rye');
    expect(used).not.toContain('maize');
    expect(list.length).toBeGreaterThan(1);
  });

  it('excludes every sequence where canFollow is false, including the wrap from last to first', () => {
    const list = generateCandidates(poznanCurrent, pl, priorities());
    for (const c of list.slice(1)) {
      c.forEach((y, i) => {
        const next = c[(i + 1) % c.length]!;
        expect(canFollow(cropById(pl, y.crop), cropById(pl, next.crop))).toBe(true);
      });
    }
    expect(has(list, [{ crop: 'maize' }, { crop: 'winter-rapeseed' }])).toBe(false);
    // winter wheat sown in October after maize harvested in October stays
    expect(has(list, [{ crop: 'maize' }, { crop: 'winter-wheat' }])).toBe(true);
  });

  it('keeps the current rotation even when it breaks a filter', () => {
    const odd: Years = [{ crop: 'maize' }, { crop: 'winter-rapeseed' }];
    const list = generateCandidates(odd, pl, priorities(['maize']));
    expect(list[0]).toEqual(odd);
  });

  it('contains no duplicates up to rotation of the cycle', () => {
    for (const list of [iowa, generateCandidates(poznanCurrent, pl, priorities())]) {
      const keys = list.map(key);
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect(iowa.filter((c) => key(c) === key([{ crop: 'soybean' }, { crop: 'maize' }]))).toHaveLength(1);
  });

  it('caps the output and keeps every one-step variant', () => {
    expect(MAX_CANDIDATES).toBe(300);
    expect(iowa.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    const pol = generateCandidates(poznanCurrent, pl, priorities());
    expect(pol.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    // a one-step variant of the Poznań rotation: field pea inserted
    expect(has(pol, [...poznanCurrent, { crop: 'field-pea' }])).toBe(true);
  });

  it('keeps an unknown current crop and skips variants that need its traits', () => {
    const unknown: Years = [{ crop: 'maize' }, { crop: 'hemp' }];
    const list = generateCandidates(unknown, us, priorities());
    expect(list[0]).toEqual(unknown);
    expect(list.slice(1).some((c) => c.some((y) => y.crop === 'hemp'))).toBe(false);
    expect(list.length).toBeGreaterThan(1);
  });

  it('Iowa maize-soybean history yields between 20 and 300 candidates, deterministically and fast', () => {
    const t0 = performance.now();
    const again = generateCandidates(current, us, priorities());
    expect(performance.now() - t0).toBeLessThan(200);
    expect(iowa.length).toBeGreaterThanOrEqual(20);
    expect(iowa.length).toBeLessThanOrEqual(300);
    expect(again).toEqual(iowa);
  });

  it('draws every cover it proposes: each cover variant has a cover-crop month for each of its covers (real data)', () => {
    const cases: [CropTraits[], RotationOption['years']][] = [
      [realUs, [{ crop: 'maize' }, { crop: 'soybean' }]],
      [realUs, [{ crop: 'alfalfa' }, { crop: 'alfalfa' }, { crop: 'maize' }]],
      [realPl, [{ crop: 'winter-wheat' }, { crop: 'maize' }, { crop: 'winter-wheat' }, { crop: 'sugar-beet' }]],
      [realPl, [{ crop: 'potato' }, { crop: 'winter-wheat' }, { crop: 'sugar-beet' }]],
    ];
    const silent: string[] = [];
    for (const [crops, current] of cases) {
      for (const years of generateCandidates(current, crops, priorities())) {
        years.forEach((y, i) => {
          if (y.coverCrop === undefined) return;
          const only = years.map((z, j) => (j === i ? z : { crop: z.crop }));
          if (!buildCalendar(only, crops).months.some((m) => m.cover === 'cover-crop')) {
            silent.push(years.map((z) => z.crop + (z.coverCrop ? `+${z.coverCrop}` : '')).join(' > '));
          }
        });
      }
    }
    expect(silent).toEqual([]);
  });
});
