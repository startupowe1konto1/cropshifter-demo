// Rotation calendar: which crop or cover is on the field in each month of the rotation cycle.
// Convention: a rotation year is the harvest year. A winter crop (harvestMonth < sowMonth) listed in year i
// is sown in year i-1 and harvested in year i. The cycle wraps, so the last year is followed by the first.
import type { CalendarMonth, CoverState, CropId, CropTraits, RotationOption } from '../contracts';

export type CalendarCell = Omit<CalendarMonth, 'exposure'>;

export function cropById(crops: CropTraits[], id: CropId): CropTraits {
  const crop = crops.find((c) => c.id === id);
  if (!crop) throw new Error(`calendar: no crop traits for '${id}'`);
  return crop;
}

export const isWinterCrop = (crop: CropTraits) => crop.harvestMonth < crop.sowMonth;

/**
 * True when `next` can be sown after `prev` is harvested. A spring crop is sown the calendar year after `prev`'s
 * harvest, so it always fits. A winter crop is sown in the same calendar year as `prev`'s harvest, so its sowing
 * month must not come before that harvest month (sowing in the harvest month itself is allowed).
 */
export function canFollow(prev: CropTraits, next: CropTraits): boolean {
  if (!isWinterCrop(next)) return true;
  return next.sowMonth >= prev.harvestMonth;
}

/** True when `month` lies between the crop's sowing and harvest months, wrapping over the new year. */
export const inSeason = (crop: CropTraits, month: number) =>
  isWinterCrop(crop) ? month >= crop.sowMonth || month <= crop.harvestMonth : month >= crop.sowMonth && month <= crop.harvestMonth;

const residueState = (crop: CropTraits): CoverState => (crop.residueCover === 'low' ? 'bare' : 'residue');

/** Months of the rotation cycle with the cover state of each, and the count of bare months per cycle. */
export function buildCalendar(
  years: RotationOption['years'],
  crops: CropTraits[],
): { months: CalendarCell[]; bareMonths: number } {
  const n = years.length;
  const size = n * 12;
  const wrap = (t: number) => ((t % size) + size) % size;
  const cells: (CalendarCell | undefined)[] = new Array(size).fill(undefined);
  const mains = years.map((y) => cropById(crops, y.crop));

  // 1. main crops. Each cell keeps one crop. When a crop is sown in the month the previous one is harvested,
  // the newly sown crop takes that month. Any other overlap can only come from a sequence that fails canFollow
  // (a farmer's own history is not filtered); there the crop already in the ground keeps the months, so the
  // later one loses its first months. Both rules depend only on the cycle, not on which year is listed first.
  const spans = mains.map((crop, i) => {
    const end = i * 12 + crop.harvestMonth - 1;
    const start = isWinterCrop(crop) ? (i - 1) * 12 + crop.sowMonth - 1 : i * 12 + crop.sowMonth - 1;
    return { crop, start: wrap(start), end: wrap(end), length: end - start + 1 };
  });
  const claims: { span: (typeof spans)[number]; age: number }[][] = Array.from({ length: size }, () => []);
  for (const span of spans) {
    for (let k = 0; k < span.length && k < size; k++) claims[wrap(span.start + k)]?.push({ span, age: k });
  }
  claims.forEach((list, t) => {
    if (list.length === 0) return;
    const sown = list.find((c) => c.age === 0);
    const othersEndHere = list.every((c) => c === sown || c.span.end === t);
    const winner = sown && othersEndHere ? sown : list.reduce((a, b) => (b.age > a.age ? b : a));
    cells[t] = { yearIndex: Math.floor(t / 12), month: (t % 12) + 1, crop: winner.span.crop.id, cover: 'crop' };
  });
  const harvestIndex = spans.map((s) => s.end);

  // 2. the gap after each harvest, until the next crop is in the ground
  mains.forEach((crop, i) => {
    const gap: number[] = [];
    for (let k = 1; k < size; k++) {
      const t = wrap((harvestIndex[i] ?? 0) + k);
      if (cells[t]) break;
      gap.push(t);
    }
    // A perennial (alfalfa) followed by another year of itself stays in the ground over winter.
    const next = mains[(i + 1) % n];
    if (crop.kind === 'perennial' && next?.id === crop.id) {
      gap.forEach((t) => (cells[t] = { yearIndex: Math.floor(t / 12), month: (t % 12) + 1, crop: crop.id, cover: 'crop' }));
      return;
    }
    const coverId = years[i]?.coverCrop;
    const cover = coverId ? cropById(crops, coverId) : undefined;
    let coverStart = gap.length;
    let coverEnd = -1;
    if (cover && gap.length > 0) {
      // If the cover's sowing month is not in the gap but falls in the main crop's season, it was sown into the
      // standing crop (interseeded, e.g. red clover sown in 8 under maize harvested in 10), so it covers the soil
      // from the first month after harvest. A sowing month outside both means the cover cannot be sown: no cover.
      // An interseeded cover that is not a winter cover and ends by the main harvest never covers the gap (same
      // rule as coverFits in candidates.ts): no cover either.
      const sowAt = gap.findIndex((t) => (t % 12) + 1 === cover.sowMonth);
      const interseeded = sowAt === -1 && inSeason(crop, cover.sowMonth);
      const outlivesHarvest = isWinterCrop(cover) || cover.harvestMonth > crop.harvestMonth;
      coverStart = sowAt !== -1 ? sowAt : interseeded && outlivesHarvest ? 0 : gap.length;
      const endAt = gap.findIndex((t, k) => k >= coverStart && (t % 12) + 1 === cover.harvestMonth);
      coverEnd = endAt === -1 ? gap.length - 1 : endAt;
    }
    gap.forEach((t, k) => {
      const base = { yearIndex: Math.floor(t / 12), month: (t % 12) + 1 };
      if (cover && k >= coverStart && k <= coverEnd) cells[t] = { ...base, crop: cover.id, cover: 'cover-crop' };
      else if (cover && k > coverEnd) cells[t] = { ...base, cover: residueState(cover) };
      else cells[t] = { ...base, cover: residueState(crop) };
    });
  });

  const months = cells.map((cell, t) => cell ?? { yearIndex: Math.floor(t / 12), month: (t % 12) + 1, cover: 'bare' as const });
  return { months, bareMonths: months.filter((m) => m.cover === 'bare').length };
}
