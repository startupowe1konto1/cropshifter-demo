// O1-F17: units and range notes from the data read in Polish on a Polish screen, and stay as they are in English.
import { localText } from './localText';

describe('localText', () => {
  it('keeps English as it is', () => {
    expect(localText('USD/ha per year', 'en')).toBe('USD/ha per year');
  });
  it('translates exact phrases and patterns in Polish', () => {
    expect(localText('share of years', 'pl')).toBe('udział lat');
    expect(localText('USD/ha per year', 'pl')).toBe('USD/ha rocznie');
    expect(localText('spread given by the source, 0–30 cm', 'pl')).toBe('rozrzut podany przez źródło, 0–30 cm');
  });
  it('shows an unknown unit as it came', () => {
    expect(localText('kg', 'pl')).toBe('kg');
  });
});
