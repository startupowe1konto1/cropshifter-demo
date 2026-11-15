// Datasets behind the money tables (data/money). Picked up by src/app/datasets.ts.
import type { Dataset } from '../contracts';

/** The day the numbers in data/money were copied from their sources (task O4-A4). */
export const RETRIEVED_AT = '2026-11-14';

export const datasets: Dataset[] = [
  {
    id: 'usda-nass-quickstats-yields', name: 'USDA NASS Quick Stats: Story County and Iowa yields', provider: 'USDA NASS',
    url: 'https://quickstats.nass.usda.gov/', nasa: false,
    resolution: 'county (maize and soybean), state (oats, alfalfa and winter wheat)',
    period: '2021–2025 mean; winter wheat 2022 (Census of Agriculture), as NASS has no Iowa survey yield after 2018',
    kind: 'observation',
  },
  {
    id: 'usda-nass-quickstats-prices', name: 'USDA NASS Quick Stats: Iowa prices received', provider: 'USDA NASS',
    url: 'https://quickstats.nass.usda.gov/', nasa: false, resolution: 'state (Iowa)',
    period: '2025 marketing year (maize and soybean Sep 2025 to Aug 2026, maize preliminary; oats Jul 2025 to Jun 2026; alfalfa hay Jun 2025 to May 2026)',
    kind: 'observation',
  },
  {
    id: 'usda-nass-crop-values-2025', name: 'USDA NASS Crop Values 2025 Summary: United States prices received', provider: 'USDA NASS',
    url: 'https://esmis.nal.usda.gov/sites/default/release-files/795791/cpvl0226.pdf', nasa: false, resolution: 'United States',
    period: '2025 marketing year (United States), winter wheat; NASS publishes no Iowa wheat price', kind: 'observation',
  },
  {
    id: 'isu-agdm-a1-20', name: 'Estimated Costs of Crop Production in Iowa – 2026 (Ag Decision Maker A1-20)', provider: 'Iowa State University Extension',
    url: 'https://www.extension.iastate.edu/agdm/crops/html/a1-20.html', nasa: false, resolution: 'Iowa, typical farm budget',
    period: '2026 budget (A1-20 revised January 2026)', kind: 'model',
  },
  {
    id: 'isu-agdm-a3-10', name: '2026 Iowa Farm Custom Rate Survey (Ag Decision Maker A3-10)', provider: 'Iowa State University Extension',
    url: 'https://www.extension.iastate.edu/agdm/crops/pdf/a3-10.pdf', nasa: false, resolution: 'Iowa, average rate reported by custom operators',
    period: '2026 survey (A3-10 PDF of March 2026)', kind: 'model',
  },
  {
    id: 'nrcs-ia-fy2026-booklet', name: 'Iowa Financial Assistance Program Scenario Booklet FY2026 (practices 340 and 328)', provider: 'USDA NRCS Iowa',
    url: 'https://www.nrcs.usda.gov/sites/default/files/2026-04/FY26%20FA%20Program%20Scenario%20Booklet_April%2028%202026.pdf', nasa: false,
    resolution: 'Iowa', period: 'fiscal year 2026 (Oct 2025 to Sep 2026), booklet of 28 Apr 2026',
    kind: 'observation',
  },
  {
    id: 'gus-produkcja-upraw', name: 'GUS crop production (Produkcja upraw rolnych i ogrodniczych), Wielkopolskie yields', provider: 'Statistics Poland (GUS)',
    url: 'https://stat.gov.pl/obszary-tematyczne/rolnictwo-lesnictwo/uprawy-rolne-i-ogrodnicze/', nasa: false, resolution: 'voivodeship (Wielkopolskie)',
    period: '2021–2025 mean (field pea 2023–2025 mean)', kind: 'observation',
  },
  {
    id: 'mrirw-zsrir', name: 'ZSRIR weekly grain and oilseed purchase prices', provider: 'Polish Ministry of Agriculture (MRiRW)',
    url: 'https://zsrir.minrol.gov.pl/', nasa: false, resolution: 'north-west macroregion (grain), Poland (rapeseed)', period: 'week 45/2026 (2–8 Nov 2026)',
    kind: 'observation',
  },
  {
    id: 'gus-skup-i-ceny-2025', name: 'GUS procurement prices of agricultural products in 2025', provider: 'Statistics Poland (GUS)',
    url: 'https://publikacje.new.stat.gov.pl/portal-publikacje/skup-i-ceny-produktow-rolnych-w-2025-r', nasa: false,
    resolution: 'voivodeship (sugar beet, table potato), Poland (field pea)', period: '2025 yearly average', kind: 'observation',
  },
  {
    id: 'wodr-poznan-kalkulacje', name: 'WODR Poznań crop budgets (kalkulacje rolnicze), February 2026', provider: 'Wielkopolski Ośrodek Doradztwa Rolniczego',
    url: 'https://www.wodr.poznan.pl/doradztwo/ekonomika', nasa: false, resolution: 'Wielkopolska, model farm budget', period: 'February 2026 budget',
    kind: 'model',
  },
  {
    id: 'pl-eco-scheme-2026', name: 'Estimated 2026 eco-scheme rates (MRiRW) and 2026 practice pages (ARiMR)', provider: 'Polish Ministry of Agriculture and ARiMR',
    url: 'https://www.gov.pl/web/rolnictwo/zaliczki-doplat-dla-rolnikow-juz-od-8-wrzesnia', nasa: false, resolution: 'Poland',
    period: '2026 estimates for advance payments (19 Aug 2026)', kind: 'observation',
  },
  {
    id: 'pl-dziennik-ustaw', name: 'Dziennik Ustaw: eco-scheme rates and conditions, GAEC norms', provider: 'Polish Ministry of Agriculture (via Sejm ELI)',
    url: 'https://api.sejm.gov.pl/eli/acts/DU', nasa: false, resolution: 'Poland', period: '2025 rates; rules in force in 2026',
    kind: 'observation',
  },
];

/** The value an economics source backs, from the start of its locator; undefined for payment sources. */
export type MoneyRole = 'yield' | 'price' | 'costs';
const ROLE_PREFIXES: { prefix: string; role: MoneyRole }[] = [
  { prefix: 'yield:', role: 'yield' },
  { prefix: 'price:', role: 'price' },
  { prefix: 'direct costs:', role: 'costs' },
];
export function roleOf(locator: string): MoneyRole | undefined {
  return ROLE_PREFIXES.find((r) => locator.startsWith(r.prefix))?.role;
}

/**
 * Which dataset a source in data/money belongs to. The first matching prefix (and role, where given) wins, so
 * specific prefixes come first. Quick Stats serves both Iowa yields and prices, which date from different periods,
 * so each role gets its own dataset and the source chip shows the right period (issue #79 item 4).
 */
const SOURCE_PREFIXES: { prefix: string; id: string; role?: MoneyRole }[] = [
  { prefix: 'https://quickstats.nass.usda.gov/', role: 'yield', id: 'usda-nass-quickstats-yields' },
  { prefix: 'https://quickstats.nass.usda.gov/', role: 'price', id: 'usda-nass-quickstats-prices' },
  { prefix: 'https://esmis.nal.usda.gov/sites/default/release-files/795791/', id: 'usda-nass-crop-values-2025' },
  { prefix: 'https://www.extension.iastate.edu/agdm/crops/pdf/a3-10', id: 'isu-agdm-a3-10' },
  { prefix: 'https://www.extension.iastate.edu/agdm/', id: 'isu-agdm-a1-20' },
  { prefix: 'https://www.nrcs.usda.gov/sites/default/files/2026-04/FY26%20FA%20Program%20Scenario%20Booklet', id: 'nrcs-ia-fy2026-booklet' },
  { prefix: 'https://stat.gov.pl/obszary-tematyczne/rolnictwo-lesnictwo/uprawy-rolne-i-ogrodnicze/', id: 'gus-produkcja-upraw' },
  { prefix: 'https://zsrir.minrol.gov.pl/', id: 'mrirw-zsrir' },
  { prefix: 'https://publikacje.new.stat.gov.pl/', id: 'gus-skup-i-ceny-2025' },
  { prefix: 'https://www.wodr.poznan.pl/', id: 'wodr-poznan-kalkulacje' },
  { prefix: 'https://www.gov.pl/web/rolnictwo/', id: 'pl-eco-scheme-2026' },
  { prefix: 'https://www.gov.pl/web/arimr/', id: 'pl-eco-scheme-2026' },
  { prefix: 'https://api.sejm.gov.pl/eli/acts/DU/', id: 'pl-dziennik-ustaw' },
];

export function datasetIdForSource(url: string, role?: MoneyRole): string | undefined {
  return SOURCE_PREFIXES.find((s) => url.startsWith(s.prefix) && (s.role === undefined || s.role === role))?.id;
}
