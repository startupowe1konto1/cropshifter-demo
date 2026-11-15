// Units and range notes are written into Sourced values by the providers and the engine, in English (O1-F17). On a
// Polish screen <SourcedNumber> shows them through this table: exact phrases first, then patterns with a variable
// part (a depth, a period, a currency). Anything not listed is shown as it came, so a new unit is never hidden.
import type { Lang } from '../app/i18n';

const PL_EXACT: Record<string, string> = {
  'share of years': 'udział lat',
  'share of rotation years': 'udział lat płodozmianu',
  'share of saturation, April to September': 'udział nasycenia, kwiecień–wrzesień',
  'share of saturation per decade': 'udział nasycenia na dekadę',
  '% by weight': '% wagowo',
  'suitability index, 0–100': 'wskaźnik przydatności, 0–100',
  days: 'dni',
  'days per decade': 'dni na dekadę',
  'mm per decade': 'mm na dekadę',
  '°C per decade': '°C na dekadę',
  'years of crop history': 'lat historii upraw',
  'months with a living crop per cycle': 'mies. z żywą uprawą w cyklu',
  'bare months per cycle': 'mies. z odkrytą glebą w cyklu',
  'bare months per rotation cycle': 'mies. z odkrytą glebą w cyklu płodozmianu',
  'mm per year in bare months': 'mm rocznie w miesiącach z odkrytą glebą',
  '% of crop-years with no hazard in sensitive months': '% lat uprawy bez zagrożeń w miesiącach wrażliwych',
  '10th–90th percentile year': 'rok od 10. do 90. percentyla',
  '10th to 90th percentile year of the record': 'rok od 10. do 90. percentyla w danych',
  '10th to 90th percentile of the record': 'od 10. do 90. percentyla w danych',
  'low and high value of the SSURGO map unit': 'najniższa i najwyższa wartość jednostki mapy SSURGO',
  'SoilGrids 5% and 95% quantiles, 0–30 cm, weighted like the mean': 'kwantyle 5% i 95% SoilGrids, 0–30 cm, ważone jak średnia',
  'SSURGO low and high columns, 0–30 cm, weighted like the representative value':
    'kolumny low i high SSURGO, 0–30 cm, ważone jak wartość reprezentatywna',
  '5th–95th percentile of the SoilGrids prediction': 'od 5. do 95. percentyla prognozy SoilGrids',
};

const PL_PATTERNS: [RegExp, string][] = [
  [/^(.+) per year$/, '$1 rocznie'],
  [/^spread given by the source, (.+)$/, 'rozrzut podany przez źródło, $1'],
  [/^95% interval of a straight-line trend, (.+)$/, '95% przedział trendu liniowego, $1'],
  [/^95% interval, (.+)$/, '95% przedział, $1'],
  [/^t\/ha, (.+), mean (.+)$/, 't/ha, $1, średnia $2'],
];

export function localText(text: string, lang: Lang): string {
  if (lang !== 'pl') return text;
  const exact = PL_EXACT[text];
  if (exact) return exact;
  for (const [pattern, replacement] of PL_PATTERNS) {
    if (pattern.test(text)) return text.replace(pattern, replacement);
  }
  return text;
}
