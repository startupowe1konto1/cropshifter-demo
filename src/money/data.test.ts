import { describe, expect, it } from 'vitest';
import { moneyFile } from '../contracts/schemas';
import pl from '../../data/money/pl.json';
import usIa from '../../data/money/us-ia.json';
import { datasetIdForSource, datasets, roleOf } from './datasets';
import { PAYMENT_IDS } from './payments';
import en from './messages/en.json';
import cropsPl from '../../data/crops/pl.json';
import cropsUs from '../../data/crops/us-ia.json';

const cropFiles = { US: cropsUs, PL: cropsPl };

const files = { 'us-ia.json': usIa, 'pl.json': pl };

describe.each(Object.entries(files))('data/money/%s', (_name, file) => {
  it('matches the moneyFile schema', () => {
    expect(moneyFile.safeParse(file).success).toBe(true);
  });

  // A cover-crop row (kind 'cover') carries direct costs only: the crop is not sold (D34, #98 item 5).
  const isCover = (row: object) => (row as { kind?: string }).kind === 'cover';

  it('has one source each for the yield, the price and the direct costs of every crop, and costs only for a cover crop', () => {
    for (const row of file.economics) {
      const roles = isCover(row) ? ['direct costs:'] : ['yield:', 'price:', 'direct costs:'];
      for (const role of ['yield:', 'price:', 'direct costs:']) {
        const expected = roles.includes(role) ? 1 : 0;
        expect(row.sources.filter((s) => s.locator.startsWith(role)), `${row.crop} ${role}`).toHaveLength(expected);
      }
    }
  });

  it('gives the yield, the price and the direct costs each their own period, with no single year for the row', () => {
    for (const row of file.economics as Record<string, unknown>[]) {
      const keys = isCover(row) ? ['costsPeriod'] : ['yieldPeriod', 'pricePeriod', 'costsPeriod'];
      for (const key of keys) {
        expect(typeof row[key] === 'string' && (row[key] as string).length > 0, `${String(row.crop)} ${key}`).toBe(true);
      }
      expect(row, String(row.crop)).not.toHaveProperty('year');
    }
  });

  it('has cover-crop rows only for crops that are cover crops in data/crops', () => {
    const covers = new Set(Object.values(cropFiles).flat().filter((c) => c.kind === 'cover').map((c) => c.id));
    for (const row of file.economics) expect(covers.has(row.crop), row.crop).toBe(isCover(row));
  });

  it('maps every source to a registered dataset', () => {
    const ids = new Set(datasets.map((d) => d.id));
    const refs = [...file.economics.flatMap((r) => r.sources), ...file.payments.flatMap((p) => p.sources)];
    for (const ref of refs) expect(ids.has(datasetIdForSource(ref.url, roleOf(ref.locator)) ?? ''), ref.url).toBe(true);
  });

  it('has a qualifying rule for every payment row', () => {
    for (const p of file.payments) expect(PAYMENT_IDS).toContain(p.id);
  });

  it('has an English text for every payment condition', () => {
    for (const p of file.payments) expect(en).toHaveProperty([p.condition]);
  });
});

describe('src/money/datasets', () => {
  it('registers only datasets that a row in data/money cites', () => {
    const refs = Object.values(files).flatMap((f) => [...f.economics.flatMap((r) => r.sources), ...f.payments.flatMap((p) => p.sources)]);
    const used = new Set(refs.map((r) => datasetIdForSource(r.url, roleOf(r.locator))));
    for (const d of datasets) expect(used.has(d.id), d.id).toBe(true);
  });
});
