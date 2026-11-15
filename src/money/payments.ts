// Which payments a rotation qualifies for (SPEC section 7, task O4-A4). Rates come from data/money/<country>.json; the
// rules below come from the documents cited in those rows. Only qualifying payments are returned, so the engine can add
// every confirmed one. A rate not confirmed for the campaign comes back with `confirmed: false`; the engine leaves it
// out of the sum and names it in the gaps. US payments are competitive: the condition text says "if selected".
import type { CropId, CropTraits, Message, MoneyEstimate, RotationOption, Sourced } from '../contracts';
import type { moneyFile } from '../contracts/schemas';
import type { z } from 'zod';
import { RETRIEVED_AT, datasetIdForSource } from './datasets';

type Years = RotationOption['years'];
type MoneyFile = z.infer<typeof moneyFile>;
type PaymentRow = MoneyFile['payments'][number];
type Payment = MoneyEstimate['payments'][number];

/** GAEC 7 in Poland: the longest run of one main crop on the field, or 'every' when it never changes. */
export type Gaec7Result = { pass: true } | { pass: false; crop: CropId; years: number | 'every' };

const GAEC7_MAX_YEARS = 3; // § 5 ust. 1 pkt 2, Dz.U. 2025 poz. 1674

/**
 * GAEC 7 as Poland applies it from 2025 (Dz.U. 2025 poz. 1674, § 5), checked on one field's rotation, read as a cycle:
 * the same main crop may not stay longer than 3 years in a row (ust. 1 pkt 2). A cover crop or undersown crop after a
 * main crop meets the rule for that year (ust. 2), so it breaks the run. Legumes, grasses and perennial crops are
 * exempt (ust. 3). The farm-wide part (40% of arable land changes crop each year, ust. 1 pkt 1) needs the whole farm
 * and is not checked here; the condition text says so.
 */
export function gaec7(years: Years, exempt: (crop: CropId) => boolean): Gaec7Result {
  const n = years.length;
  if (n === 0) return { pass: true };
  // A run continues from year i to i+1 when both have the same non-exempt crop and no cover crop follows year i.
  const continues = (i: number) => {
    const a = years[i % n]!;
    const b = years[(i + 1) % n]!;
    return a.crop === b.crop && !exempt(a.crop) && !a.coverCrop;
  };
  if (years.every((_, i) => continues(i))) return { pass: false, crop: years[0]!.crop, years: 'every' };
  // Start counting just after a break, so a run that wraps around the end of the cycle is counted whole.
  const start = years.findIndex((_, i) => !continues(i)) + 1;
  let worst: { crop: CropId; years: number } | undefined;
  let run = 1;
  for (let k = 0; k < n; k++) {
    const i = start + k;
    const year = years[i % n]!;
    if (!exempt(year.crop) && run > GAEC7_MAX_YEARS && (!worst || run > worst.years)) worst = { crop: year.crop, years: run };
    run = continues(i) ? run + 1 : 1;
  }
  return worst ? { pass: false, ...worst } : { pass: true };
}

// Annex 5 to the eco-scheme regulation (Dz.U. 2023 poz. 493), for the crop ids in data/crops/pl.json.
const SOM_POSITIVE: CropId[] = ['field-pea']; // wykaz nr 1: groch siewny
const CEREALS: CropId[] = ['winter-wheat']; // wykaz nr 2: pszenica ozima (maize is not on the list)
const SOM_NEGATIVE: CropId[] = ['sugar-beet', 'potato']; // wykaz nr 3: burak cukrowy, ziemniak
const ON_NO_LIST: CropId[] = ['maize'];
/** Main crops whose place on the annex 5 lists has been copied from the regulation. Rye, spring barley and winter
 * rapeseed have not: until they are, a rotation with them does not claim the diverse crop structure. */
const ANNEX5_KNOWN = new Set<CropId>([...SOM_POSITIVE, ...CEREALS, ...SOM_NEGATIVE, ...ON_NO_LIST]);

const share = (years: Years, test: (y: Years[number]) => boolean) => years.filter(test).length / years.length;

/** Eco-scheme "Zróżnicowana struktura upraw" shares (Dz.U. 2023 poz. 493 § 8, as amended by Dz.U. 2023 poz. 1926), over the rotation's years. */
function diverseStructure(years: Years): boolean {
  const counts = new Map<CropId, number>();
  for (const y of years) counts.set(y.crop, (counts.get(y.crop) ?? 0) + 1);
  const largest = Math.max(...counts.values()) / years.length;
  return (
    years.every((y) => ANNEX5_KNOWN.has(y.crop)) &&
    counts.size >= 3 &&
    largest <= 0.65 &&
    share(years, (y) => SOM_POSITIVE.includes(y.crop)) >= 0.2 &&
    share(years, (y) => CEREALS.includes(y.crop)) <= 0.65 &&
    share(years, (y) => SOM_NEGATIVE.includes(y.crop)) <= 0.3
  );
}

// NRCS Iowa practice 328 (FY2026 booklet, pp. 32–33). One scenario is paid per field: the perennial one if it applies,
// else the small grain one, else the basic one.
const SMALL_GRAINS: CropId[] = ['oats', 'winter-wheat', 'spring-barley', 'rye'];
type TraitsOf = (crop: CropId) => CropTraits | undefined;

/** Distinct main crops of the rotation other than those matching `added`. */
const otherCrops = (years: Years, added: (crop: CropId) => boolean) => new Set(years.map((y) => y.crop).filter((c) => !added(c))).size;

/** 328-138: a short-term perennial grown at least two years in a row, added to a rotation of at least two other crops. */
function perennialRotation(years: Years, traits: TraitsOf): boolean {
  const isPerennial = (crop: CropId) => traits(crop)?.kind === 'perennial';
  const n = years.length;
  const twoYears = years.some((y, i) => isPerennial(y.crop) && years[(i + 1) % n]!.crop === y.crop && n > 1);
  return twoYears && otherCrops(years, isPerennial) >= 2;
}

/** 328-139: a winter annual or small grain added to a rotation of at least two other crop types. */
function smallGrainRotation(years: Years): boolean {
  const isSmallGrain = (crop: CropId) => SMALL_GRAINS.includes(crop);
  return years.some((y) => isSmallGrain(y.crop)) && otherCrops(years, isSmallGrain) >= 2;
}

/** 328-1: an annual rotation with at least two different crop types. */
const basicRotation = (years: Years, traits: TraitsOf) =>
  new Set(years.filter((y) => traits(y.crop)?.kind !== 'perennial').map((y) => y.crop)).size >= 2;

/** Share of the rotation's years that earn each payment; 0 means the rotation does not qualify. */
const RULES: Record<string, (years: Years, traits: TraitsOf) => number> = {
  'us-nrcs-340-cover-crop': (years) => share(years, (y) => !!y.coverCrop),
  'us-nrcs-328-perennial': (years, traits) => (perennialRotation(years, traits) ? 1 : 0),
  'us-nrcs-328-small-grain': (years, traits) => (!perennialRotation(years, traits) && smallGrainRotation(years) ? 1 : 0),
  'us-nrcs-328-basic': (years, traits) =>
    !perennialRotation(years, traits) && !smallGrainRotation(years) && basicRotation(years, traits) ? 1 : 0,
  'pl-eco-cover-crop': (years) => share(years, (y) => !!y.coverCrop),
  'pl-eco-crop-diversity': (years) => (diverseStructure(years) ? 1 : 0),
  // § 12 ust. 2: straw of cereals including maize, oilseeds and legumes.
  'pl-eco-straw': (years, traits) =>
    share(years, (y) => {
      const t = traits(y.crop);
      return !!t && t.kind === 'cash' && (t.family === 'Poaceae' || t.family === 'Brassicaceae' || t.legume);
    }),
};
export const PAYMENT_IDS = [...Object.keys(RULES), 'pl-gaec7'];

const round2 = (x: number) => Math.round(x * 100) / 100;

function amount(row: PaymentRow, value: number, currency: MoneyFile['currency'], kind: Sourced['kind']): Sourced {
  const datasetIds = [...new Set(row.sources.map((s) => datasetIdForSource(s.url)).filter((id): id is string => !!id))];
  return { value, unit: `${currency}/ha per year`, datasetIds, kind, retrievedAt: RETRIEVED_AT };
}

/** The payments of `file` this rotation qualifies for, plus the GAEC 7 result for Poland (no money of its own). */
export function paymentsFor(file: MoneyFile, years: Years, crops: CropTraits[]): MoneyEstimate['payments'] {
  if (years.length === 0) return [];
  const traits = (crop: CropId) => crops.find((c) => c.id === crop);
  const out: Payment[] = [];
  for (const row of file.payments) {
    if (row.id === 'pl-gaec7') {
      const exempt = (crop: CropId) => {
        const t = traits(crop);
        return !!t && (t.legume || t.kind === 'perennial');
      };
      const result = gaec7(years, exempt);
      const condition: Message = result.pass
        ? { code: `${row.condition}-pass` }
        : result.years === 'every'
          ? { code: `${row.condition}-fail-every`, params: { crop: result.crop } }
          : { code: `${row.condition}-fail`, params: { crop: result.crop, years: result.years } };
      out.push({ programme: row.programme, amountPerHa: amount(row, row.amountPerHa, file.currency, 'observation'), condition, confirmed: row.confirmed });
      continue;
    }
    const rule = RULES[row.id];
    if (!rule) continue; // a row without a rule is never paid out; data.test.ts keeps the ids in step
    const part = rule(years, traits);
    if (part <= 0) continue;
    out.push({
      programme: row.programme,
      amountPerHa: amount(row, round2(row.amountPerHa * part), file.currency, part === 1 ? 'observation' : 'derived'),
      condition: { code: row.condition },
      confirmed: row.confirmed,
    });
  }
  return out;
}
