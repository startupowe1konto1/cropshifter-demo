// Polish text for the data strings step 6 shows: dataset details in the source panels, payment programme names, the
// campaign line and units. The data files keep English (one source of truth for the numbers and their sources), so
// step 6 swaps the text here when the UI is in Polish. A string without a Polish entry stays in English.
import type { Dataset, MoneyEstimate, Sourced } from '../../contracts';
import type { Lang } from '../../app/i18n';

type DatasetText = Partial<Pick<Dataset, 'name' | 'provider' | 'resolution' | 'period'>>;

const DATASETS_PL: Record<string, DatasetText> = {
  nasadem: { name: 'NASADEM, wysokość terenu (spadek to nasze obliczenia)', resolution: '30 m' },
  'usda-cropscape': { name: 'USDA NASS Cropland Data Layer (mapa upraw)', resolution: '30 m' },
  'usda-ssurgo': {
    name: 'USDA NRCS SSURGO, mapa gleb',
    resolution: 'jednostka mapy, około 1:24 000',
    period: 'kartowanie gleb',
  },
  'isric-soilgrids': { resolution: '250 m', period: 'wydanie z 2020 r.' },
  'fao-gaez-v4': {
    name: 'FAO GAEZ v4, przydatność upraw i osiągalny plon',
    resolution: 'około 9 km',
    period: '1981–2010; scenariusze 2041–2100',
  },
  'team-crop-calendars': {
    name: 'Kalendarze i cechy upraw użyte w narzędziu (miesiące siewu i zbioru, okrywa resztek)',
    provider: 'Zespół, ze źródeł podanych przy każdej uprawie (USDA NASS, FAO, IUNG-PIB)',
    resolution: 'dla każdej uprawy i kraju',
    period: 'typowe terminy',
  },
  'usda-nass-quickstats-yields': {
    name: 'USDA NASS Quick Stats: plony w hrabstwie Story i w stanie Iowa',
    resolution: 'hrabstwo (kukurydza i soja), stan (owies, lucerna i pszenica ozima)',
    period: 'średnia 2021–2025; pszenica ozima 2022 (spis rolny), bo NASS nie podaje plonu dla Iowa po 2018 r.',
  },
  'usda-nass-quickstats-prices': {
    name: 'USDA NASS Quick Stats: ceny otrzymywane w Iowa',
    resolution: 'stan (Iowa)',
    period:
      'rok gospodarczy 2025 (kukurydza i soja IX 2025 – VIII 2026, kukurydza wstępnie; owies VII 2025 – VI 2026; siano z lucerny VI 2025 – V 2026)',
  },
  'usda-nass-crop-values-2025': {
    name: 'USDA NASS Crop Values 2025: ceny otrzymywane w USA',
    resolution: 'Stany Zjednoczone',
    period: 'rok gospodarczy 2025 (USA), pszenica ozima; NASS nie podaje ceny pszenicy dla Iowa',
  },
  'isu-agdm-a1-20': {
    name: 'Szacunkowe koszty produkcji roślinnej w Iowa – 2026 (Ag Decision Maker A1-20)',
    provider: 'Iowa State University Extension',
    resolution: 'Iowa, typowy budżet gospodarstwa',
    period: 'budżet na 2026 r. (A1-20, wersja ze stycznia 2026)',
  },
  'isu-agdm-a3-10': {
    name: 'Badanie stawek usług rolniczych w Iowa 2026 (Ag Decision Maker A3-10)',
    resolution: 'Iowa, średnia stawka podana przez usługodawców',
    period: 'badanie 2026 (PDF A3-10 z marca 2026)',
  },
  'nrcs-ia-fy2026-booklet': {
    name: 'Katalog scenariuszy pomocy finansowej NRCS Iowa, rok budżetowy 2026 (praktyki 340 i 328)',
    resolution: 'Iowa',
    period: 'rok budżetowy 2026 (X 2025 – IX 2026), katalog z 28 IV 2026',
  },
  'gus-produkcja-upraw': {
    name: 'GUS, Produkcja upraw rolnych i ogrodniczych: plony w województwie wielkopolskim',
    provider: 'Główny Urząd Statystyczny (GUS)',
    resolution: 'województwo (wielkopolskie)',
    period: 'średnia 2021–2025 (groch siewny: średnia 2023–2025)',
  },
  'mrirw-zsrir': {
    name: 'ZSRIR: tygodniowe ceny skupu zbóż i oleistych',
    provider: 'Ministerstwo Rolnictwa i Rozwoju Wsi (MRiRW)',
    resolution: 'makroregion północno-zachodni (zboża), Polska (rzepak)',
    period: 'tydzień 45/2026 (2–8 XI 2026)',
  },
  'gus-skup-i-ceny-2025': {
    name: 'GUS, Skup i ceny produktów rolnych w 2025 r.',
    provider: 'Główny Urząd Statystyczny (GUS)',
    resolution: 'województwo (burak cukrowy, ziemniak jadalny), Polska (groch siewny)',
    period: 'średnia roczna 2025',
  },
  'wodr-poznan-kalkulacje': {
    name: 'WODR Poznań, kalkulacje rolnicze, luty 2026',
    resolution: 'Wielkopolska, modelowy budżet gospodarstwa',
    period: 'kalkulacje z lutego 2026',
  },
  'pl-eco-scheme-2026': {
    name: 'Szacunkowe stawki ekoschematów na 2026 r. (MRiRW) i opisy praktyk na 2026 r. (ARiMR)',
    provider: 'Ministerstwo Rolnictwa i Rozwoju Wsi oraz ARiMR',
    resolution: 'Polska',
    period: 'szacunki na 2026 r. do wypłaty zaliczek (19 VIII 2026)',
  },
  'pl-dziennik-ustaw': {
    name: 'Dziennik Ustaw: stawki i warunki ekoschematów, normy GAEC',
    provider: 'Ministerstwo Rolnictwa i Rozwoju Wsi (przez Sejm ELI)',
    resolution: 'Polska',
    period: 'stawki 2025; przepisy obowiązujące w 2026 r.',
  },
  'nasa-power-monthly': {
    name: 'NASA POWER, miesięczne dane agroklimatyczne',
    provider: 'NASA Langley Research Center (LaRC)',
    resolution: 'około 50 km',
  },
  'nasa-power-daily': {
    name: 'NASA POWER, dobowe dane agroklimatyczne (dobowa temperatura maksymalna)',
    resolution: 'około 50 km',
  },
  'smap-l4-rootzone': {
    name: 'SMAP L4, wilgotność gleby w strefie korzeniowej (NASA GIBS)',
    resolution: '9 km',
    period: 'od 2015 do dziś',
  },
  'nasa-power-climatology': {
    name: 'NASA POWER, klimatologia (cechy bazy podobnych regionów)',
    resolution: 'około 50 km',
  },
  'usda-nass-county-crops': {
    name: 'USDA NASS Quick Stats, powierzchnia zbioru i plony w hrabstwach (baza podobnych regionów)',
    resolution: 'hrabstwo',
  },
  'eurostat-apro-cpnhr': {
    name: 'Eurostat, produkcja upraw w regionach NUTS 2 (apro_cpnhr)',
    resolution: 'region NUTS 2',
  },
};

const PROGRAMMES_PL: Record<string, string> = {
  'Eco-scheme carbon farming: winter cover crops or undersown crops':
    'Ekoschemat „Rolnictwo węglowe”: międzyplony ozime lub wsiewki śródplonowe',
  'Eco-scheme carbon farming: diverse crop structure': 'Ekoschemat „Rolnictwo węglowe”: zróżnicowana struktura upraw',
  'Eco-scheme carbon farming: straw mixed into the soil': 'Ekoschemat „Rolnictwo węglowe”: wymieszanie słomy z glebą',
  'GAEC 7 crop rotation rule (conditionality, no payment of its own)':
    'Norma GAEC 7, zmianowanie upraw (warunkowość, bez osobnej dopłaty)',
  'NRCS EQIP practice 340, Cover Crop, single species (Iowa, FY2026)':
    'NRCS EQIP, praktyka 340: międzyplon jednogatunkowy (Iowa, rok budżetowy 2026)',
  'NRCS EQIP practice 328, Conservation Crop Rotation, basic (Iowa, FY2026)':
    'NRCS EQIP, praktyka 328: płodozmian ochronny, wariant podstawowy (Iowa, rok budżetowy 2026)',
  'NRCS EQIP practice 328, Conservation Crop Rotation, winter or spring annual (Iowa, FY2026)':
    'NRCS EQIP, praktyka 328: płodozmian ochronny ze zbożem ozimym lub jarym (Iowa, rok budżetowy 2026)',
  'NRCS EQIP practice 328, Conservation Crop Rotation, short-term perennial (Iowa, FY2026)':
    'NRCS EQIP, praktyka 328: płodozmian ochronny z krótkotrwałą uprawą wieloletnią (Iowa, rok budżetowy 2026)',
};

const CAMPAIGNS_PL: Record<string, string> = {
  'campaign 2026: grain and rapeseed prices of 2-8 Nov 2026, other prices 2025 or Sep 2026, WODR costs Feb 2026; eco-scheme rates are 2026 estimates, check ARiMR':
    'kampania 2026: ceny zbóż i rzepaku z 2–8 XI 2026, pozostałe ceny z 2025 r. lub z IX 2026, koszty WODR z II 2026; stawki ekoschematów to szacunki na 2026 r., sprawdź w ARiMR',
  'prices 2025 marketing year (USDA NASS), costs ISU 2026, NRCS Iowa payment rates FY2026':
    'ceny z roku gospodarczego 2025 (USDA NASS), koszty ISU 2026, stawki dopłat NRCS Iowa na rok budżetowy 2026',
};

/** Units: "PLN/ha per year" → "PLN/ha rocznie". Plain units such as "PLN/ha" read the same in both languages. */
function unitPl(unit: string | undefined): string | undefined {
  return unit?.replace(/ per year$/, ' rocznie');
}

export function localizeDatasets(datasets: Dataset[], lang: Lang): Dataset[] {
  if (lang !== 'pl') return datasets;
  return datasets.map((d) => ({ ...d, ...DATASETS_PL[d.id] }));
}

export function localizeSourced(value: Sourced, lang: Lang): Sourced {
  if (lang !== 'pl') return value;
  return { ...value, unit: unitPl(value.unit) };
}

export function localizeMoney(money: MoneyEstimate, lang: Lang): MoneyEstimate {
  if (lang !== 'pl') return money;
  return {
    ...money,
    campaign: CAMPAIGNS_PL[money.campaign] ?? money.campaign,
    payments: money.payments.map((p) => ({
      ...p,
      programme: PROGRAMMES_PL[p.programme] ?? p.programme,
      amountPerHa: localizeSourced(p.amountPerHa, lang),
    })),
  };
}
