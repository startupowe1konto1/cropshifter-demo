// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateDataDir } from './validate_data';

let root: string;
const write = (path: string, content: unknown) => {
  const full = join(root, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, JSON.stringify(content));
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'validate-data-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const rule = {
  id: 'nitrogen.soybean-credit',
  value: 40,
  unit: 'kg N/ha',
  appliesTo: 'soybean',
  sourceTitle: 'Example extension bulletin',
  sourceUrl: 'https://example.org/bulletin',
  sourceLocator: 'table 2',
};

describe('validateDataDir', () => {
  it('passes when the data folders do not exist', () => {
    expect(validateDataDir(root)).toEqual([]);
  });

  it('accepts a rule row with a source', () => {
    write('data/rules/nitrogen.json', [rule]);
    expect(validateDataDir(root)).toEqual([]);
  });

  it('rejects a rule row without a source and names the file and field', () => {
    const { sourceUrl: _dropped, ...withoutSource } = rule;
    write('data/rules/nitrogen.json', [withoutSource]);
    const problems = validateDataDir(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('data/rules/nitrogen.json');
    expect(problems[0]).toContain('sourceUrl');
  });

  it('rejects a precomputed file without a meta block', () => {
    write('data/precomputed/soil.json', { iowa: { sandPct: 20 } });
    expect(validateDataDir(root).join('\n')).toContain('data/precomputed/soil.json: meta');
  });

  it('accepts a precomputed file with a meta block', () => {
    write('data/precomputed/soil.json', {
      meta: { retrievedAt: '2026-11-14', script: 'scripts/soil_point.py', sourceUrl: 'https://rest.isric.org/soilgrids/v2.0/' },
      iowa: { sandPct: 20 },
    });
    expect(validateDataDir(root)).toEqual([]);
  });

  it('rejects a crop without sources', () => {
    write('data/crops/pl.json', [
      {
        id: 'rye', family: 'Poaceae', legume: false, kind: 'cash', sowMonth: 9, harvestMonth: 7, sensitive: [],
        waterNeed: 'low', yieldResponseFactor: 1, forage: false, residueCover: 'medium', sources: [],
      },
    ]);
    expect(validateDataDir(root).join('\n')).toContain('sources');
  });

  it('reports a file that is not JSON', () => {
    mkdirSync(join(root, 'data/rules'), { recursive: true });
    writeFileSync(join(root, 'data/rules/broken.json'), '{ not json');
    expect(validateDataDir(root)[0]).toContain('not valid JSON');
  });
});
