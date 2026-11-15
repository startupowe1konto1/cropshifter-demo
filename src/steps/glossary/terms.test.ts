import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { cwd } from 'node:process';
import { setLang } from '../../app/i18n';
import terms from './terms.en.json';
import plTerms from './terms.pl.json';
import { TERM_IDS, lookupTerm, term, useTerm } from './useTerm';

const REQUIRED = [
  'evapotranspiration',
  'anomaly',
  'ndvi',
  'soil-moisture',
  'root-zone',
  'soil-wetness-index',
  'suitability-class',
  'cover-crop',
  'catch-crop',
  'humus-balance',
  'percentile-range',
  'model-estimate',
  'margin',
];

// Vitest runs from the repo root (vite.config.ts), so src is next to it.
const srcDir = join(cwd(), 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return [];
    return [path];
  });
}

// useTerm('id'), term('id') and <Term id="id" ...>. Ids passed through a variable are not checked here;
// the TermId type catches those at typecheck time.
const CALL = /\b(?:useTerm|term)\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
const PROP = /<Term\b[^>]*?\bid=(?:"([^"]+)"|'([^']+)'|\{\s*['"`]([^'"`]+)['"`]\s*\})/g;

function termIdsIn(code: string): string[] {
  const ids = [...code.matchAll(CALL)].map((m) => m[1]!);
  for (const m of code.matchAll(PROP)) ids.push((m[1] ?? m[2] ?? m[3])!);
  return ids;
}

describe('glossary terms', () => {
  it('has the twelve terms of SPEC section 11', () => {
    for (const id of REQUIRED) expect(Object.keys(terms)).toContain(id);
    expect(TERM_IDS).toEqual(expect.arrayContaining(REQUIRED));
  });

  it('uses kebab-case ids and one short plain sentence per term', () => {
    for (const [id, entry] of Object.entries(terms)) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(entry.label.trim()).not.toBe('');
      const words = entry.explanation.trim().split(/\s+/);
      expect(words.length, `${id}: ${words.length} words`).toBeLessThanOrEqual(25);
      expect(entry.explanation, id).toMatch(/^[A-Z].*\.$/);
      expect(entry.explanation, `${id}: one sentence`).not.toMatch(/[.!?]\s+[A-Z]/);
      expect(entry.explanation, `${id}: no dashes as punctuation`).not.toMatch(/[–—]| - /);
    }
  });

  it('finds term ids in source code', () => {
    const code = `<Term {...useTerm('ndvi')} /> {term("root-zone")} <Term id="anomaly" /> <Term label="x" id={'cover-crop'} />`;
    expect(termIdsIn(code).sort()).toEqual(['anomaly', 'cover-crop', 'ndvi', 'root-zone']);
  });

  it('knows every term id used in src', () => {
    const missing: string[] = [];
    for (const file of sourceFiles(srcDir)) {
      for (const id of termIdsIn(readFileSync(file, 'utf8'))) {
        if (!(id in terms)) missing.push(`${relative(srcDir, file).split(sep).join('/')}: ${id}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('useTerm', () => {
  it('returns the label and the sentence for a known id', () => {
    expect(useTerm('ndvi')).toEqual(terms.ndvi);
    expect(term('root-zone').label).toBe(terms['root-zone'].label);
  });

  it('fails loudly on an unknown id in tests', () => {
    expect(() => term('no-such-term' as never)).toThrow('no-such-term');
  });

  it('shows the id instead of crashing outside tests', () => {
    expect(lookupTerm('no-such-term', false)).toEqual({ label: 'no-such-term', explanation: 'no-such-term' });
  });
});

// #76 / HANDOFF v7 second task: under ?lang=pl the glossary and the <Term> pop-ups read terms.pl.json.
describe('useTerm in Polish', () => {
  afterEach(() => setLang('en'));

  it('returns the Polish label and sentence when the language is Polish', () => {
    setLang('pl');
    expect(term('root-zone')).toEqual(plTerms['root-zone']);
    expect(useTerm('ndvi')).toEqual(plTerms.ndvi);
  });

  it('goes back to English when the language is switched back', () => {
    setLang('pl');
    setLang('en');
    expect(term('root-zone')).toEqual(terms['root-zone']);
  });

  it('falls back to the English entry for a term with no Polish text', () => {
    const tables = { en: terms, pl: {} };
    expect(lookupTerm('ndvi', true, 'pl', tables)).toEqual(terms.ndvi);
  });

  it('still fails loudly on an unknown id in Polish', () => {
    setLang('pl');
    expect(() => term('no-such-term' as never)).toThrow('no-such-term');
  });
});

describe('Polish glossary terms', () => {
  it('follow the English rules: one short plain sentence per term', () => {
    for (const [id, entry] of Object.entries(plTerms)) {
      expect(entry.label.trim(), id).not.toBe('');
      const words = entry.explanation.trim().split(/\s+/);
      expect(words.length, `${id}: ${words.length} words`).toBeLessThanOrEqual(25);
      expect(entry.explanation, id).toMatch(/^\p{Lu}.*\.$/u);
      expect(entry.explanation, `${id}: one sentence`).not.toMatch(/[.!?]\s+\p{Lu}/u);
      expect(entry.explanation, `${id}: no dashes as punctuation`).not.toMatch(/[–—]| - /);
    }
  });
});
