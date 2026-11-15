// MoneyProvider on the money tables in data/money (task O4-A4). Tables only: the engine replays the yields over the
// field's climate record (src/engine/income.ts). Nothing here is estimated: a crop without a sourced yield, price and
// direct costs gives `no-data` naming that crop. A cover crop is not sold: it needs only direct costs (D34).
import type { AsyncResult, CropEconomics, CropId, CropTraits, Field, MoneyProvider, Sourced, SourceRef, ValueKind } from '../contracts';
import type { moneyFile } from '../contracts/schemas';
import type { z } from 'zod';
import cropsPl from '../../data/crops/pl.json';
import cropsUs from '../../data/crops/us-ia.json';
import moneyPl from '../../data/money/pl.json';
import moneyUs from '../../data/money/us-ia.json';
import { RETRIEVED_AT, datasetIdForSource, roleOf, type MoneyRole } from './datasets';
import { paymentsFor } from './payments';

export type MoneyFile = z.infer<typeof moneyFile>;
export interface MoneyTables { US: MoneyFile; PL: MoneyFile }
export interface CropTables { US: CropTraits[]; PL: CropTraits[] }

/**
 * Each source locator in data/money starts with the value it backs ('yield:', 'price:' or 'direct costs:'), so every
 * value gets the dataset it came from. The yield is a mean over years (our calculation from official statistics), the
 * price is an official statistic, the direct costs come from an extension service budget (an estimate).
 * Each value's period (the row's yieldPeriod, pricePeriod or costsPeriod) reaches the source chip as the period of
 * that dataset: Sourced has no period field, and SourcedNumber shows dataset.period (issue #79 item 4).
 */
const KINDS: Record<MoneyRole, ValueKind> = { yield: 'derived', price: 'observation', costs: 'model' };

function value(sources: SourceRef[], role: MoneyRole, amount: number, unit: string): Sourced {
  const ids = sources.filter((s) => roleOf(s.locator) === role).map((s) => datasetIdForSource(s.url, role));
  const datasetIds = [...new Set(ids.filter((id): id is string => !!id))];
  if (datasetIds.length === 0) throw new Error(`money: no registered dataset for the ${role} source`);
  return { value: amount, unit, datasetIds, kind: KINDS[role], retrievedAt: RETRIEVED_AT };
}

/** Why a cover crop's yield and price are null: it is grown for the soil, not sold (D34). */
const COVER_NOT_SOLD = 'cover crop, not sold (D34)';

const NO_TABLES: AsyncResult<never> = { status: 'no-data', reason: { code: 'money.no-tables' } };

export function createTableMoneyProvider(tables: MoneyTables, crops: CropTables): MoneyProvider {
  return {
    async getEconomics(field: Field, requested: CropId[]): Promise<AsyncResult<CropEconomics[]>> {
      if (field.country === 'OTHER') return NO_TABLES;
      const table = tables[field.country];
      // Cover crops are not sold, so they have no yield or price (D34). A cover crop with a sourced cost row
      // (kind 'cover') returns its direct costs; one without a row is skipped and the engine names the gap.
      const cover = new Set(crops[field.country].filter((c) => c.kind === 'cover').map((c) => c.id));
      const out: CropEconomics[] = [];
      for (const crop of [...new Set(requested)]) {
        const row = table.economics.find((r) => r.crop === crop);
        if (cover.has(crop)) {
          if (row?.kind !== 'cover') continue;
          const costs = value(row.sources, 'costs', row.directCostsPerHa, `${table.currency}/ha`);
          const notSold = (unit: string): Sourced => ({ ...costs, value: null, unit, missingReason: COVER_NOT_SOLD });
          out.push({ crop, referenceYieldTPerHa: notSold('t/ha'), pricePerT: notSold(`${table.currency}/t`), directCostsPerHa: costs });
          continue;
        }
        // A row without a yield or a price (a cover-crop row, D34) cannot back a sold crop.
        if (!row || row.kind === 'cover' || row.referenceYieldTPerHa == null || row.pricePerT == null) {
          return { status: 'no-data', reason: { code: 'money.no-economics', params: { crop } } };
        }
        out.push({
          crop,
          referenceYieldTPerHa: value(row.sources, 'yield', row.referenceYieldTPerHa, 't/ha'),
          pricePerT: value(row.sources, 'price', row.pricePerT, `${table.currency}/t`),
          directCostsPerHa: value(row.sources, 'costs', row.directCostsPerHa, `${table.currency}/ha`),
        });
      }
      return { status: 'ready', data: out };
    },

    async getPayments(field, rotation) {
      if (field.country === 'OTHER') return NO_TABLES;
      return { status: 'ready', data: paymentsFor(tables[field.country], rotation, crops[field.country]) };
    },
  };
}

export const tableMoneyProvider: MoneyProvider = createTableMoneyProvider(
  { US: moneyUs as MoneyFile, PL: moneyPl as MoneyFile },
  { US: cropsUs as CropTraits[], PL: cropsPl as CropTraits[] },
);
