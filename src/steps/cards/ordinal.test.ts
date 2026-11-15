// O1-F17: the rank on keeping the soil reads "132nd" in English and "132." in Polish.
import { setLang } from '../../app/i18n';
import { ordinal } from './RotationCard';

afterEach(() => setLang('en'));

describe('ordinal', () => {
  it('uses English suffixes in English', () => {
    setLang('en');
    expect([1, 2, 3, 11, 12, 13, 21, 132].map(ordinal)).toEqual(['1st', '2nd', '3rd', '11th', '12th', '13th', '21st', '132nd']);
  });

  it('writes a number with a dot in Polish', () => {
    setLang('pl');
    expect(ordinal(132)).toBe('132.');
    expect(ordinal(1)).toBe('1.');
  });
});
