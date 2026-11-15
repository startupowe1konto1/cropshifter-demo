# Crop traits: sources

`us-ia.json` and `pl.json` hold one `CropTraits` row per crop (schema `cropTraits` in `src/contracts/schemas.ts`). Every value was copied from a document opened on Sat 14 Nov 2026 (task O4-A2; oats, spring barley, rye and winter rapeseed were added in a second PR the same day; a third PR took in research R10, `context/research/agronomy-thresholds.md`). Each row lists its sources with a page, table or section. Sources from R10 also name their excerpt file in `data/samples/research/agronomy/`.

## Sources used

| Source | URL | What was taken |
|---|---|---|
| USDA NASS, Field Crops Usual Planting and Harvesting Dates (Agricultural Handbook 628), October 2010 | https://esmis.nal.usda.gov/sites/default/release-files/vm40xr56k/dv13zw65p/w9505297d/planting-10-29-2010.pdf | Iowa table, page 39: most active planting and harvest windows for corn for grain, corn for silage, soybeans, winter wheat, spring oats and alfalfa hay |
| COBORU, Wyniki porejestrowych doświadczeń odmianowych: Zboża ozime 2024 (No. 219) | https://coboru.gov.pl/Publikacje_COBORU/Wyniki_PDO/WPDO_219_Zboza_ozime_2024.pdf | Tabela 2, page 37: winter wheat sowing, heading and harvest dates, national trial means 2024 and 2023; Tabela 2, page 81: the same for winter rye |
| COBORU, Zboża jare 2024 (No. 209) | https://coboru.gov.pl/Publikacje_COBORU/Wyniki_PDO/WPDO_209_Zboza_jare_2024.pdf | Tabela 2, page 12: spring barley sowing, heading and harvest dates, national trial means 2024 and 2023 |
| COBORU, Oleiste 2024 (No. 220) | https://coboru.gov.pl/Publikacje_COBORU/Wyniki_PDO/WPDO_220_Oleiste_2024.pdf | Tabela 5, page 16: winter rapeseed sowing, flowering and harvest dates, national trial means for the 2023/2024 and 2022/2023 seasons |
| COBORU, Kukurydza 2024 (No. 208) | https://coboru.gov.pl/Publikacje_COBORU/Wyniki_PDO/WPDO_kukurydza_2024.pdf | page 13: grain maize sowing, emergence and harvest dates; Tabela 4, page 14: days from emergence to silking |
| COBORU, Bobowate 2024 (No. 211) | https://coboru.gov.pl/Publikacje_COBORU/Wyniki_PDO/WPDO_211_Bobowate_2024.pdf | Tabela 3 (groch siewny), page 24: field pea sowing, flowering and harvest dates |
| COBORU, Burak cukrowy 2024 (No. 207) | https://coboru.gov.pl/Publikacje_COBORU/Wyniki_PDO/WPDO_207_Burak_cukrowy_2024.pdf | page 10: sugar beet sowing and harvest dates |
| COBORU, Ziemniak 2024 (No. 214) | https://coboru.gov.pl/Publikacje_COBORU/Wyniki_PDO/WPDO_214_Ziemniak_2024.pdf | Tabela 15, page 25: planting and harvest dates of mid-early and mid-late ware potatoes |
| FAO Irrigation and Drainage Paper 66, Crop yield response to water (2012) | https://www.fao.org/4/i2800e/i2800e.pdf | Table 1, page 6: seasonal yield response factors (Ky) from FAO Paper 33 |
| FAO Irrigation and Drainage Paper 56, chapter 6 | https://www.fao.org/4/x0490e/x0490e0b.htm | Table 11: stage lengths (initial, development, mid-season, late) used to place the mid-season stage when the calendar source gives no flowering date |
| FAO Irrigation Water Management Training Manual 3, chapter 3 | https://www.fao.org/4/s2022e/s2022e07.htm | Table 14: seasonal crop water need in mm, turned into the water need class |
| FAO Irrigation and Drainage Paper 24, Crop water requirements (Doorenbos and Pruitt, revised 1977) | https://www.fao.org/3/s8376e/s8376e.pdf | Table 20, page 36: seasonal ETcrop in mm for Grains (small) and Oil seeds, used for rye and winter rapeseed, which have no Table 14 row |
| IUNG-PIB, Studia i Raporty 57(11) (2018), G. Podolska, Plon i jakość ziarna pszenicy ozimej uprawianej w warunkach wysokiej temperatury oraz stresu suszy | https://iung.pl/wp-content/uploads/2009/10/zesz57.pdf | page 10, text and Tabela 1: spring and summer water need of rye (250-280 mm), winter rapeseed (200-220 mm) and winter wheat (270-300 mm); a check on the rye and rapeseed class only |
| USDA NRCS Washington, Technical Note Agronomy 22 (2025) | https://nrcs.usda.gov/plantmaterials/wapmctn15062.pdf | pages 3 to 5: high residue and low residue crop lists, fragile and non-fragile residue list |
| USDA NRCS Nebraska Conservation Planning Sheet No. 4, Crop Residue Management (2006) | https://www.mssoy.org/sites/default/files/documents/residue-mgmt-nrcs-2006.pdf | section "Residue type": soybeans are a low residue crop |
| Iowa State University Extension, Alfalfa Seeding Recommendations (17 April 2024) | https://crops.extension.iastate.edu/post/alfalfa-seeding-recommendations | alfalfa is commonly spring-planted with an oat companion crop |
| Hatfield and Prueger (2015), Temperature extremes: Effect on plant growth and development, Weather and Climate Extremes 10: 4-10, doi:10.1016/j.wace.2015.08.001 (open access copy opened) | https://pages.uoregon.edu/chendon/coffee_literature/old_literature/2015%20Weather%20Clim.%20Extremes,%20Temperature%20extremes%20on%20plant%20growth.pdf | page 5: maize pollen viability falls above 35 °C; soybean seed set falls from 30 to 35 °C and sterility is complete above 35 °C |
| FAO Irrigation and Drainage Paper 66, crop chapters | https://www.fao.org/4/i2800e/i2800e.pdf | wheat page 93 (frost at head development and flowering) and page 98 (above 34 °C during grain filling); soybean page 128 (frost at emergence and pod filling) and page 129 (flower and fruit abortion at 35 °C); potato page 187 (frost at 1 °C and less, heat at 35 °C or higher); barley page 139 (above 30-32 °C during grain filling) |
| Barlow et al. (2013), Simulating the impact of extreme heat and frost events on wheat production: the first steps, MODSIM 2013 | https://mssanz.org.au/modsim2013/B2/barlow2.pdf | page 1: heat shock (>35 °C) and frost do most damage at ear emergence and anthesis; heat events cost 17-35 percent of yield |
| USDA NRCS and Iowa State University, Cereal Rye Cover Crop Fact Sheet for Iowa (May 2024) | https://www.nrcs.usda.gov/sites/default/files/2024-04/Cereal%20Rye%20Cover%20Crop%20Fact%20Sheet.pdf | seeding mid August to late October; grazing quality excellent; lasting residue excellent |
| USDA NRCS and Iowa State University, Red Clover Cover Crop Fact Sheet for Iowa (May 2024) | https://www.nrcs.usda.gov/sites/default/files/2024-05/Red%20Clover%20Crop%20Fact%20Sheet.pdf | winter seeding early August to mid September; grow until at least mid-May for nitrogen; grazing quality very good; lasting residue fair |
| Iowa State University Extension, Terminating cover crops ahead of corn (22 April 2026) | https://crops.extension.iastate.edu/post/terminating-cover-crops-ahead-corn | terminate the cover crop at least 10 days before planting corn |
| IUNG-PIB, Uprawa międzyplonów, instrukcja upowszechnieniowa (2025) | https://www.iung.pl/wp-content/uploads/2026/03/instrukcja.pdf | PDF pages 9, 13, 23-26: stubble catch crop sowing window, latest sowing dates for mustard and phacelia (Tabele 11 and 12), ARiMR rule to keep them until 15 October, termination in October, use of each species |

### Added from research R10

| Source | URL | What was taken |
|---|---|---|
| Moteva et al. (2016), Water use efficiency and yield-dependences for canola under irrigation, Agriculture & Forestry 62(1): 403-413 | https://repository.ukim.mk/bitstream/20.500.12188/28014/1/20160330-42%20Moteva%20et%20al.pdf | Summary p. 403, Results p. 408, Conclusion 4 p. 411: winter rapeseed Ky 1.52 (R² 0.73), winter canola near Sofia, 2010-2013 |
| Tidy et al. (2025), Plant Stress 17: 100957 (open access, Rothamsted Repository) | https://repository.rothamsted.ac.uk/id/eprint/33546/1/Tidy%20et%20al%202025%20Plant%20Stress.pdf | PDF p. 3: rapeseed heat above 29 °C cuts seed yield by more than 50 percent; heat threshold 29 °C, lossShare 0.5 |
| Licht (2020), Cold temperatures on the way; what will it mean for corn and soybean seedlings?, ISU ICM | https://crops.extension.iastate.edu/post/cold-temperatures-way-what-will-it-mean-corn-and-soybean-seedlings | paragraphs 8-10: emerged maize tissue dies at 28 °F (-2 °C); soybean cotyledons survive above 30 °F; maize May frost row, soybean May frost confirmed |
| Licht and Hurburgh (2019), Harvest consideration for frost killed corn, ISU ICM | https://crops.extension.iastate.edu/post/harvest-consideration-frost-killed-corn | paragraphs 7 and 9: a freeze of 28 °F kills the plant before black layer; yield loss 12 percent (late dent) to 41 percent (beginning dent); maize September frost row, lossShare 0.12 |
| Licht and Archontoulis (2020), What impact will the heat and dry weather have on pollination 2020?, ISU ICM | https://crops.extension.iastate.edu/post/what-impact-will-heat-and-dry-weather-have-pollination-2020 | paragraphs 7-8: maize heat stress above 95 °F (35 °C) around pollination; second source for the 35 °C row |
| Hurburgh, Vittetoe and Anderson (2019), Frost Damage to Soybeans, ISU ICM | https://crops.extension.iastate.edu/post/frost-damage-soybeans | paragraphs 1-3: killing freeze 28 °F, green pods most affected; soybean pod-filling frost confirmed |
| Shroyer, Mikesell and Paulsen (1995), Spring Freeze Injury to Kansas Wheat, C646, Kansas State University | https://bookstore.ksre.ksu.edu/pubs/C646.PDF | p. 2 Table 1: -1 °C at heading and flowering (severe), -2 °C at milk and dough; wheat May-June frost confirmed (us-ia and pl) |
| IUNG-PIB, Instrukcja upowszechnieniowa nr 200 (2015), Uprawa kukurydzy w systemie ekologicznym | https://www.iung.pl/wp-content/uploads/2023/09/Instrukcja-Uprawa-kukurydzy-w-systemie-ekologicznym.pdf | PDF pp. 22 and 24: drops below -2 °C stop maize growth; early autumn frost is dangerous during grain filling; Polish maize September frost row |
| COBORU, WEDO nr 227, Kukurydza (na ziarno), rok zbioru 2025 | https://coboru.gov.pl/Publikacje_COBORU/Wyniki_PDO/WEDO_227_Kukurydza_2025.pdf | PDF p. 8, Tabela 3, Śrem: emergence 19 May, silking 26 July, full maturity 1 October; months of the Polish maize frost rows |
| Bueckert, Pea yield formation in warming temperatures, University of Saskatchewan project (page by Saskatchewan Pulse Growers) | https://saskpulse.com/research/listing/pea-yield-formation-in-warming-temperatures-phenological-mechanisms/ | Project Description: a few days above 29 °C cause flower and young pod abortion; field pea heat threshold 29 °C in June |
| FAO Land and Water, Crop information: Pea (read through the Internet Archive, D37) | https://www.fao.org/land-water/databases-and-software/crop-information/pea/en/ (archive: http://web.archive.org/web/20250907125315/https://www.fao.org/land-water/databases-and-software/crop-information/pea/en/) | stage Ky 0.2 / 0.9 / 0.7 / 0.2, season 1.15; confirms the field pea Ky |
| Licht and Clemens (2021), Considerations when overseeding cover crops, ISU ICM News | https://crops.extension.iastate.edu/cropnews/2021/07/considerations-when-overseeding-cover-crops | overseeding in the last week of August to the first week of September; supports cereal rye `sowMonth` 9 |
| Podleśny and Leszczyńska (2025), Międzyplony i ich znaczenie w produkcji rolniczej, IUNG-PIB presentation | https://www.iung.pl/wp-content/uploads/2026/03/Prezentacja-miedzyplony-2025.pdf | slide 5: ARiMR rule, stubble catch crops sown 1 July to 20 August and kept until 15 October; slide 30: mustard and phacelia sown by 15 August; confirms the mustard and phacelia windows |

## What R10 changed

| Crop | File | Change |
|---|---|---|
| winter-rapeseed | pl | `yieldResponseFactor` 1.52 (Moteva et al. 2016), so its income is no longer no-data. New heat row: April and May, T2M_MAX above 29 °C, lossShare 0.5 (Tidy et al. 2025). The months are the COBORU flowering period (mean start about 18 April, end 10 and 27 May). |
| spring-barley | pl | Heat threshold 32 → 30 °C. Same source (FAO Paper 66, barley, p. 139, "above 30-32 ºC"); R10's rule takes the low end of a range, and this file now does the same. |
| maize | us-ia, pl | Two new frost rows. May (emerged seedlings, -2 °C lethal, ISU 2020), lossShare 0.2 rule of thumb. September (grain fill before maturity, -2 °C, ISU 2019 and IUNG 2015; Śrem maturity 1 October in COBORU WEDO 2025), lossShare 0.12, the low end of the ISU 12-41 percent loss. Heat 35 °C unchanged; ISU 2020 added as a second source. |
| field-pea | pl | New heat row: June (flowering), T2M_MAX above 29 °C, lossShare 0.2 rule of thumb. FAO crop information page added as a second source for Ky 1.15. |
| soybean | us-ia | No value change. ISU 2020 and ISU 2019 added as sources for the May and pod-filling frost row. |
| winter-wheat | us-ia, pl | No value change. Kansas State C646 added for the May-June frost row. |
| cereal-rye | us-ia | No value change. ISU 2021 overseeding article added for `sowMonth` 9. Termination stays April (at least 10 days before corn planting). |
| white-mustard, phacelia | pl | No value change. The IUNG 2025 presentation (ARiMR rule) agrees with the current August sowing and October termination. |

Iowa maize autumn frost: R10's months column says October, from the date of the ISU 2019 article (a late-planted year). Its POWER rule says "the month before maturity". The NASS harvest midpoint is October, so the row uses September. The NASA POWER sample for Ames (`data/samples/power/point-monthly-1981-2025-ag.json`) has more than one frost day in October in 39 of 45 years, against 2 of 45 in September; an October row would mark almost every year although the crop is normally mature by then.

Not used: Istanbulluoglu et al. (2010), rapeseed Ky 0.87. Only an abstract on a third-party index was read, and D37 rules that out as a value source. The Terra Nostra / EIT Food rapeseed guide (NGO) and the Iowa Soybean Association flyer (industry) were not needed for any value: winterkill cannot be a frost row (see Missing), and the ISU pages cover cereal rye.

## How the numbers were derived

- Sowing and harvest month (Iowa): the month that holds the midpoint of the NASS "most active" window. Oats: planting midpoint 17 April, harvest midpoint 27 July. Alfalfa has no planting date in NASS, so its sowing month is the spring oat window (Iowa State says alfalfa is usually sown with oats), and its harvest month is the end of the most active cutting window (15 September).
- Sowing and harvest month (Poland): the month of the mean of the 2024 and 2023 national trial dates in COBORU. COBORU gives national means, not Wielkopolska alone. Winter rapeseed: sown on 2 September and 30 August, a mean of 31 August, so August.
- Drought-sensitive months: FAO Paper 66 (page 6, below Table 1) names flowering and yield formation as the stages most sensitive to water stress. Where COBORU gives a flowering date (heading for wheat, spring barley and rye, silking for maize, start of flowering for pea and winter rapeseed), the sensitive months are that month and the next one. Otherwise the mid-season stage start comes from FAO-56 Table 11 counted from the sowing date, and the sensitive months are that month and the next one. For alfalfa hay each cut is a harvest, so the sensitive months are those with at least 10 days inside the NASS cutting window (June to September).
- Water need class: from the upper bound of the FAO Table 14 range. Up to 600 mm is low, 601 to 750 mm medium, above 750 mm high. Rye and winter rapeseed have no Table 14 row, so the class comes from FAO Paper 24 Table 20: Grains (small) 300-450 mm for rye and Oil seeds 300-600 mm for rapeseed, both low. The two FAO tables do not agree for small grains (Table 14 puts barley, oats and wheat at 450-650 mm, which is medium), so rye is low partly because its value comes from the other table. IUNG (Studia i Raporty 57) gives rye and rapeseed a lower spring and summer water need than winter wheat, which fits the low class.
- Residue cover: crops on the NRCS high residue list are `high`, crops on the low residue list are `low`. Alfalfa hay is on the low residue list (residue removed) but is non-fragile, so it is `medium`.
- Forage: `true` only where the calendar source lists a forage use (Iowa "Corn for silage" and "Hay, alfalfa"; the COBORU silage maize series).
- Family and legume flag: copied from `src/fixtures/crops.ts`, as task O4-A2 requires.
- Heat: a source temperature for damage at flowering or grain filling (spring barley: 30 °C, the low end of the 30-32 °C range in FAO Paper 66, as R10's conversion rule says; rapeseed and field pea: 29 °C) is used as the threshold for the monthly maximum of NASA POWER T2M_MAX, in the same flowering and yield-formation months as drought. A short spell above the source temperature is enough to do the damage the sources describe, so the monthly maximum is compared with it directly.
- Frost: where a source says the crop is damaged by frost at a stage, the row uses threshold 1 in the months of that stage, which the engine reads as more than one, i.e. two or more NASA POWER frost days (FROST_DAYS > threshold). A POWER frost day is any frost at or below 0 °C while the sources give damage at about -1 to -2 °C, so one frost day alone is not counted. This conversion is a team conversion and each crop row with a frost row cites it as such. Wheat: heading and grain filling. Soybean (Iowa): emergence in May and pod filling in August and September (FAO-56 Table 11 stages from the sowing midpoint). Potato: emergence in May (FAO-56 initial stage from planting). Maize (both files): emergence in May and grain fill in September, the month before maturity, in two rows because the September row has its own loss share. The engine counts a month as a frost hit when its frost days are above the threshold (`src/engine/resilience.ts`), so threshold 1 means two or more frost days in the month, not one; R10 and the older rows call it "at least one". All frost rows use the same 1, so they agree with each other; whether it should be 0 is open (see the PR).
- Yield response factor: oats, spring barley and rye have no Ky of their own in any opened document. Since D53 (the user's decision, Sat 14 Nov) they borrow a wheat value from FAO Paper 66 Table 1, matched by sowing season: oats and spring barley take Spring wheat 1.15, rye takes Winter wheat 1.05. Each row says so in `yieldResponseFactorFrom` and in a source titled "borrowed from", and the card names it in its gaps (`gap.income-ky-borrowed`). Before D53 these crops had no income (D29).
- Cover crops (`kind: 'cover'`): no water need or yield response factor (contract PR #44), and no hazard rows, since they are not harvested for yield. Sowing month is the midpoint of the seeding window for Iowa (NRCS fact sheets). For the Polish stubble catch crops it is August: IUNG gives the latest sowing date as 10 August (phacelia mixtures) or 15 August (mustard) and says they follow the cereal harvest, which COBORU puts in August. `harvestMonth` is the termination month. Residue: the NRCS Washington note puts any cover crop left on the field on the high residue list; a cover crop the note lists as fragile (mustard, fall seeded cover crops) is `medium`.

## Team rules of thumb

These values have no document behind them. Each row says so in a source entry titled "team rule of thumb" that points to SPEC section 7.

- Drought threshold 20: the 20th percentile of the field's own root-zone wetness (SPEC section 7).
- `lossShare` 0.2 for drought, and for heat and frost where no source gives a loss share: no opened document gives a share of yield lost in a damaging month. The income score uses the yield response factor for water shortfall, so the drought value only matters where the engine reads `lossShare` for drought. Winter wheat heat uses 0.17, the low end of the 17-35 percent loss in Barlow et al. (2013).

## Missing

No crop is left out of the files now. Three crops are in without a yield response factor, so their income is no-data (D29):

| Crop | File | Missing trait |
|---|---|---|
| oats | us-ia | yield response factor: FAO Paper 66 Table 1 (the FAO-33 seasonal values) has no oats value; R10 found no measured value in FAO Water Reports 22 either, and two candidate papers did not open |
| spring-barley | pl | yield response factor: no barley value in FAO Table 1. The one measured value R10 found (Andersen et al., IPI 1/1994, Table 5) is 0.38 in one year and 1.48-1.50 in the next for the whole season, too wide for an income replay |
| rye | pl | yield response factor: not in FAO Table 1, nor in FAO Water Reports 22 (R10) |

Proxy values (for example the wheat Ky for oats or rye) were not approved, so the field stays empty until a document with the crop's own Ky is opened.

Heat and frost rows still missing after R10:

| Crop | File | Missing |
|---|---|---|
| alfalfa | us-ia | heat: no number for hay (FAO Paper 66 gives 27 °C for seed yield only). Frost: SDSU gives -4 °C for four hours on spring regrowth, but no source gives the months in Iowa, so no row |
| field-pea | pl | frost: NDSU gives only tolerance (seedlings survive frost in the low 20s °F), not a damaging temperature |
| sugar-beet | pl | heat and frost: FAO Paper 66 says only to sow when "the risks of frost is nil"; no damaging temperature for emergence or autumn roots |
| oats | us-ia | heat and frost: no number |
| spring-barley | pl | frost: Penn State ranks barley the most frost-susceptible small grain, but gives no temperature; FAO Paper 66 p. 140 gives none either |
| rye | pl | heat and frost: Penn State says only that rye is the hardiest small grain |
| winter-rapeseed | pl | winterkill: -15 °C without snow, -20 °C under 5-10 cm of snow (IOR-PIB 2025 instruction, PDF p. 5; IUNG 2017 field report of damage below -10 °C in late January and February). FROST_DAYS cannot express a minimum temperature; it needs NASA POWER monthly T2M_MIN and snow depth SNODP, which is a [contract] change. No °C number for frost at bolting or flowering either |
| potato | pl | frost on foliage beyond FAO Paper 66 "1 °C and less": no other source opened. Kiongo et al. (2025) give 25 °C for delayed tuberisation, but the monthly hottest hour passes 25 °C nearly every summer, so the 35 °C row stays |
| winter-wheat | us-ia, pl | heat at grain fill: the Kansas State pages are JavaScript-only; 34 °C (FAO Paper 66 p. 98) stays the only value |
| soybean | us-ia | heat damage number: NC State gives only an 85 °F optimum, not a damage limit; 35 °C stays |
| cover crops | us-ia, pl | not scored for hazards (not harvested for yield) |

Cover crop windows still missing (R10): the current 2023-2027 catch crop rule on gov.pl or ARiMR (the dates come from the IUNG 2025 slide that quotes them), the NRCS 340 seeding-date table by Iowa zone, red clover frost seeding and termination dates for Iowa.

FAO EcoCrop (https://ecocrop.apps.fao.org/ecocrop/srv/en/home) opened, but its name search returned no records on 14 Nov 2026, so it gave no thresholds.

## Opened but not used for values

- IUNG-PIB, "ABC wysiewu zbóż" (2023), https://www.iung.pl/wp-content/uploads/2023/07/ABC_wysiewu_zboz_zadanie8.pdf, page 15: optimal sowing in western Poland is the second half of September for winter wheat and 15 to 30 September for rye. COBORU trial means (6 October for wheat) were used instead, because COBORU also gives harvest and flowering dates from the same trials.
- FAO Crop Calendar API (https://api-cropcalendar.apps.fao.org/api/v1/countries): Poland is not among its 58 countries.
- FAO, The State of Food and Agriculture 2008, https://www.fao.org/4/i0100e/i0100e.pdf, Table 10, page 64: potential crop evapotranspiration of rapeseed 500 mm. It is one value, not a range, and gives maize 550 mm, below the Table 14 maize range used here, so it was not used for the class.
- COBORU 2025 reports (Zboża jare No. 228, Oleiste No. 234), listed at https://coboru.gov.pl/pl/publikacje: not opened for values. The 2024 reports were used, as for the other Polish crops.

## Field pea heat row (#98 item 11)

Field pea keeps its heat row: June, 29 °C, lossShare 0.2 (team rule of thumb). The source is a research project page of the University of Saskatchewan (R. Bueckert) published by Saskatchewan Pulse Growers, a producer group, not the paper itself; the row's source entry says so. Its text, "A few days of heat above 29°C in the field causes flower and young pod abortion", matches how the engine counts heat since D43 (#113): a month is a heat month only with at least `hazards.heat.minDays` = 3 days of NASA POWER daily T2M_MAX above the crop's threshold. At the Poznań field 6 of 45 Junes (1981–2025) have 3 or more days above 29 °C: 1996, 2000, 2016, 2019, 2021, 2022 (excerpt `data/samples/power/daily-t2mmax-june-1981-2025-poznan.json`). With the earlier monthly hottest-hour indicator the same threshold was crossed in 30 of 45 Junes, which is why the row was briefly left out in an earlier version of this PR.
