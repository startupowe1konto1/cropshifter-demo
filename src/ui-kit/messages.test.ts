// #76: the ui-kit's own texts (source chips, states, confidence, term pop-ups) need Polish too, with the same keys
// and the same {placeholders} as English, or the Polish UI shows English inside every card.
type Dictionary = Record<string, string>;
const files = import.meta.glob<Dictionary>('./messages/*.json', { eager: true, import: 'default' });

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('ui-kit messages', () => {
  const en = files['./messages/en.json']!;
  const pl = files['./messages/pl.json'];

  it('has a Polish file', () => {
    expect(pl).toBeDefined();
  });

  it('has the same keys in Polish as in English', () => {
    expect(Object.keys(pl ?? {}).sort()).toEqual(Object.keys(en).sort());
  });

  it('keeps every {placeholder} of each key, and no Polish text is left empty', () => {
    for (const [key, text] of Object.entries(en)) {
      const polish = pl?.[key] ?? '';
      expect(polish.trim(), key).not.toBe('');
      expect(placeholders(polish), key).toEqual(placeholders(text));
    }
  });
});
