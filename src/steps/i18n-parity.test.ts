// Polish text must say the same things as the English: same keys, same {placeholders}.
// Only folders that already have a pl.json are checked, so a new O2 folder merged with just en.json does not fail here.
type Dictionary = Record<string, string>;
type Terms = Record<string, Record<string, string>>;

const messageFiles = {
  ...import.meta.glob<Dictionary>('../map/**/messages/*.json', { eager: true, import: 'default' }),
  ...import.meta.glob<Dictionary>('./**/messages/*.json', { eager: true, import: 'default' }),
};
const termFiles = import.meta.glob<Terms>('./glossary/terms.*.json', { eager: true, import: 'default' });

// Same pattern as t() in src/app/i18n.ts.
function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
}

const folderOf = (path: string) => path.replace(/\/[^/]+\.json$/, '');
const plFolders = Object.keys(messageFiles)
  .filter((path) => path.endsWith('/pl.json'))
  .map(folderOf)
  .sort();

describe('Polish message files under src/map and src/steps', () => {
  it('finds at least one pl.json to check', () => {
    expect(plFolders.length).toBeGreaterThan(0);
  });

  for (const folder of plFolders) {
    describe(folder, () => {
      const en = messageFiles[`${folder}/en.json`];
      const pl = messageFiles[`${folder}/pl.json`]!;

      it('sits next to an en.json', () => {
        expect(en).toBeDefined();
      });

      it('has the same keys as en.json', () => {
        expect(Object.keys(pl).sort()).toEqual(Object.keys(en ?? {}).sort());
      });

      it('keeps every {placeholder} of each key', () => {
        for (const [key, text] of Object.entries(en ?? {})) {
          if (!(key in pl)) continue;
          expect(placeholders(pl[key]!), key).toEqual(placeholders(text));
        }
      });

      it('has no empty text', () => {
        for (const [key, text] of Object.entries(pl)) expect(text.trim(), key).not.toBe('');
      });
    });
  }
});

describe('glossary terms.pl.json', () => {
  const en = termFiles['./glossary/terms.en.json'];
  const pl = termFiles['./glossary/terms.pl.json'];

  it('exists next to terms.en.json', () => {
    expect(en).toBeDefined();
    expect(pl).toBeDefined();
  });

  it('has the same term ids as terms.en.json', () => {
    expect(Object.keys(pl ?? {}).sort()).toEqual(Object.keys(en ?? {}).sort());
  });

  it('has the same fields for each term, none empty', () => {
    for (const [id, entry] of Object.entries(en ?? {})) {
      const plEntry = pl?.[id] ?? {};
      expect(Object.keys(plEntry).sort(), id).toEqual(Object.keys(entry).sort());
      for (const [field, text] of Object.entries(plEntry)) expect(text.trim(), `${id}.${field}`).not.toBe('');
    }
  });
});
