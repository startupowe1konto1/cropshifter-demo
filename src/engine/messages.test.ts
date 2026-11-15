import { describe, expect, it } from 'vitest';
import en from './messages/en.json';
import { INCOME_MESSAGE_CODES } from './income';
import { CARD_MESSAGE_CODES } from './messages';
import { PRIORITY_MESSAGE_CODES } from './priorityScores';
import { RESILIENCE_MESSAGE_CODES } from './resilience';
import { SOIL_MESSAGE_CODES } from './soilHealth';

describe('src/engine/messages/en.json', () => {
  it.each([
    ['CARD_MESSAGE_CODES', CARD_MESSAGE_CODES],
    ['INCOME_MESSAGE_CODES', INCOME_MESSAGE_CODES],
    ['PRIORITY_MESSAGE_CODES', PRIORITY_MESSAGE_CODES],
    ['RESILIENCE_MESSAGE_CODES', RESILIENCE_MESSAGE_CODES],
    ['SOIL_MESSAGE_CODES', SOIL_MESSAGE_CODES],
  ] as const)('has an English text for every code in %s', (_name, codes) => {
    const missing = codes.filter((c) => typeof (en as Record<string, unknown>)[c] !== 'string');
    expect(missing).toEqual([]);
  });
});

// #105 minor: the hazard checks see a threshold crossed in a sensitive month, not crop damage, so no text may say
// "damage" or that a hazard "hit" a crop.
describe('hazard wording', () => {
  it('says a threshold was crossed, never that a crop was damaged or hit', () => {
    for (const [code, text] of Object.entries(en)) {
      expect(text, code).not.toMatch(/\bdamage\b|\bhit the\b/i);
    }
  });
});
