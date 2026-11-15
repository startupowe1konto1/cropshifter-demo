import en from './messages/en.json';
import pl from './messages/pl.json';
import { currentLang, dictionaries, readInitialLang, setLang, t, textFor, useLang } from './i18n';

afterEach(() => {
  setLang('en');
});

describe('language', () => {
  it('starts in English', () => {
    expect(currentLang()).toBe('en');
    expect(t('app.next')).toBe(en['app.next']);
  });

  it('gives the Polish text once the language is Polish', () => {
    setLang('pl');
    expect(currentLang()).toBe('pl');
    expect(useLang.getState().lang).toBe('pl');
    expect(t('app.next')).toBe(pl['app.next']);
    expect(document.documentElement.lang).toBe('pl');
  });

  it('fills placeholders in the Polish text too', () => {
    setLang('pl');
    expect(t('app.stepOf', { n: 2, total: 7 })).toBe(pl['app.stepOf'].replace('{n}', '2').replace('{total}', '7'));
  });

  it('falls back to the English text for a code with no Polish text', () => {
    const dicts = { en: { only: 'English only {x}' }, pl: {} };
    expect(textFor('only', 'pl', { x: 1 }, dicts)).toBe('English only 1');
    expect(textFor('missing', 'pl', undefined, dicts)).toBe('missing');
  });

  it('has Polish for every code in the app messages, with the same placeholders', () => {
    expect(Object.keys(pl).sort()).toEqual(Object.keys(en).sort());
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [code, text] of Object.entries(en)) {
      expect(placeholders(pl[code as keyof typeof pl]), code).toEqual(placeholders(text));
    }
  });

  // O1-F17: engine messages carry crop, hazard and month names as English words ("field pea", "drought", "July").
  it('puts Polish crop, hazard and month names into Polish sentences', () => {
    setLang('pl');
    const pea = dictionaries.pl['crop.field-pea']!.toLowerCase();
    expect(t({ code: 'risk.new-crop', params: { crop: 'field pea' } })).toContain(pea);
    expect(t({ code: 'risk.new-crop', params: { crop: 'field pea' } })).not.toContain('field pea');
    const line = t({ code: 'evidence.hazard-month', params: { hazard: 'drought', crop: 'rye', month: 'July', hit: 3, years: 45 } });
    expect(line).toContain(dictionaries.pl['calendar.hazard.drought']!.toLowerCase());
    expect(line).toContain(dictionaries.pl['calendar.month.7']!);
    expect(line).toContain(dictionaries.pl['crop.rye']!.toLowerCase());
    // A sentence that starts with the crop still starts with a capital letter.
    expect(t({ code: 'why.legume', params: { crop: 'field pea' } })[0]).toBe(pea[0]!.toUpperCase());
    setLang('en');
    expect(t({ code: 'risk.new-crop', params: { crop: 'field pea' } })).toContain('field pea');
  });

  // O1-F17: the user found English sentences (engine reasons, gaps, risks) on the Polish screen. Every folder with an
  // en.json needs a pl.json with the same codes and placeholders, so a language switch never leaves English behind.
  it('has Polish for every code in every message folder, with the same placeholders', () => {
    const enFiles = import.meta.glob<Record<string, string>>('../**/messages/en.json', { eager: true, import: 'default' });
    const plFiles = import.meta.glob<Record<string, string>>('../**/messages/pl.json', { eager: true, import: 'default' });
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(Object.keys(enFiles).length).toBeGreaterThan(5);
    for (const [path, enDict] of Object.entries(enFiles)) {
      const plDict = plFiles[path.replace(/en\.json$/, 'pl.json')];
      expect(plDict, `${path}: no pl.json`).toBeDefined();
      const missing = Object.keys(enDict).filter((code) => !(code in plDict!));
      expect(missing, `${path}: codes with no Polish`).toEqual([]);
      for (const [code, text] of Object.entries(enDict)) {
        expect(placeholders(plDict![code]!), `${path} ${code}`).toEqual(placeholders(text));
      }
    }
  });

  it('remembers the choice for the next visit', () => {
    setLang('pl');
    expect(readInitialLang('', window.localStorage)).toBe('pl');
    setLang('en');
    expect(readInitialLang('', window.localStorage)).toBe('en');
  });
});

describe('readInitialLang', () => {
  const storage = (value: string | null) => ({ getItem: () => value });

  it('reads ?lang=pl from the address first', () => {
    expect(readInitialLang('?lang=pl', storage('en'))).toBe('pl');
  });

  it('then the saved choice', () => {
    expect(readInitialLang('', storage('pl'))).toBe('pl');
  });

  it('defaults to English for anything else, including a storage that throws', () => {
    expect(readInitialLang('?lang=de', storage('fr'))).toBe('en');
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readInitialLang('', broken)).toBe('en');
  });
});
