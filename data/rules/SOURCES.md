# Sources of the rule tables

Every row in `data/rules/*.json` names its source (`sourceTitle`, `sourceUrl`, `sourceLocator`). This file lists the sources, what was taken from each, the rows the team set itself, and the rules still missing. A mentor should review it before the Sunday freeze.

## Sources opened

| Source | URL | Used for |
|---|---|---|
| U.S. Drought Monitor, Drought Classification | https://droughtmonitor.unl.edu/About/AbouttheData/DroughtClassification.aspx | `hazards.drought.percentile` = 20: category D1 "Moderate Drought" spans the 10.01–20.00 percentile range |
| NASA POWER parameter dictionary | https://power.larc.nasa.gov/api/system/manager/parameters?community=AG&parameters=FROST_DAYS,T2M_MAX,GWETROOT&temporal=monthly | definitions of the three hazard indicators (GWETROOT, T2M_MAX, FROST_DAYS); saved in `data/samples/power/parameters-frost-tmax-gwetroot.json` |
| FAO GAEZ v4 res05 legend, "Crop Suitability Index in Classes" | https://gaez-services.fao.org/server/rest/services/res05/ImageServer/legend?f=json | class bounds (SI > 75 very high … SI > 10 marginal, SI > 0 very marginal) and the exclusion line at SI ≤ 10; saved in `data/samples/gaez/res05-legend-suitability-classes.json` |

## Rows the team set itself

These are labelled `team decision` or `team rule of thumb` and the screen says so.

| Row | Value | Basis |
|---|---|---|
| `goals.*.weights` | SPEC section 7 table | team decision D9 |
| `goals.soilFloor.points` | 5 | team decision D9 |
| `goals.shownOthers.count` | 3 | team decision D20 (a) |
| `goals.priorityDoubling.factor` | 2 | team rule of thumb, SPEC section 7 |
| `hazards.calendar.markShare` | 0.2 | team rule of thumb, SPEC section 8 |

## Missing

- Heat and frost per crop group: not in this table. Crop rows in `data/crops` carry their own sourced thresholds; `hazards.heat.generalThresholdC` (35 °C) and `hazards.frost.generalThresholdDays` (10 frost days in a month) are crop-independent team rules of thumb for the field summary (D26).
- Soil health gaps (the second O4-B0 pull request): listed under "Missing: soil health tables" below.

## Soil health tables (second O4-B0 pull request)

Files: `nitrogen.json` (14 rows), `humus.json` (31 rows), `erosion.json` (14 rows), `pest-break.json` (10 rows). Each source PDF was downloaded on Sat 14 Nov 2026 and the pages used are saved as text in `data/samples/rules/`.

### Sources opened

| Source | URL | Used for | Excerpt |
|---|---|---|---|
| Sawyer (2014), ISU Soil Fertility Current Topic "Nitrogen Fertilization Rates for Corn Production" | https://www.agronext.iastate.edu/soilfertility/currenttopics/NitrogenFertilizationRates_10-14-2014.pdf | Table 1, p. 2: Iowa N rate for maize after soybean (137, range 126–149 lb N/acre) and after maize (190, range 178–201) at price ratio 0.10 | `isu-nitrogen-rates-2014.txt` |
| Sawyer (2008), ISU Current Topic "Nitrogen Fertilization for Corn Following Corn" | https://www.agronext.iastate.edu/soilfertility/currenttopics/CC_Nitrogen_3-19-08.pdf | p. 1: maize after maize needs 45–60 lb N/acre more than maize after soybean (`nitrogen.credit.soybean.us-ia`) | `isu-cc-nitrogen-2008.txt` |
| Sawyer (2004), ISU Integrated Crop Management Conference paper on high fertilizer prices | https://www.agronext.iastate.edu/soilfertility/info/highfertilizerprices04icm.pdf | Table 2, p. 172: first-year maize after a forage legume needs 0–25 lb N/acre in Iowa studies; p. 165: continuous maize highest return at 170 lb N/acre | `isu-high-fertilizer-prices-2004.txt` |
| Sawyer (2006), ISU ICM Conference "Managing Nitrogen for High Corn Yields" | https://www.agronext.iastate.edu/soilfertility/info/ManNitrHighCornYields_2006ICMConf.pdf | p. 3: the soybean effect lasts one maize year; second-year maize after alfalfa responds like maize after soybean | `isu-managing-n-high-yields-2006.txt` |
| Rozporządzenie Rady Ministrów z 31 stycznia 2023 (Dz.U. 2023 poz. 244), Polish nitrates action programme | https://api.sejm.gov.pl/eli/acts/DU/2023/244/text.pdf | Annex 8, Table 13, Dz.U. p. 121: N left for the next crop by legumes (25 kg N/ha after a field pea main crop, 15–50 kg in other cases) and by ploughed sugar beet leaves (25 kg) | `pl-nitrates-programme-2023-table13.txt` |
| Jadczyszyn, Lipiński, Kowalczyk (2025), IUNG-PIB / KSChR "Nawożenie na gruntach ornych i trwałych użytkach zielonych" (IU251) | https://www.iung.pl/wp-content/uploads/2025/04/IU251.pdf | p. 6: N dose formula with the legume term Nb and the 0.7 use factor for mineral N | `iung-iu251-2025.txt` |
| Siebielec (2014), IUNG-PIB slides on soil organic matter | https://iung.pl/wp-content/uploads/2013/01/1.5-PIB-2014.pdf | slide 4: humus reproduction and degradation coefficients from Kodeks Dobrej Praktyki Rolniczej 2004 by soil class; slide 5: VDLUFA ranges in kg humus C/ha/year | `iung-siebielec-2014-humus.txt` |
| Wischmeier and Smith (1978), USDA Agriculture Handbook 537 | https://www.ars.usda.gov/ARSUserFiles/60600505/RUSLE/AH_537%20Predicting%20Rainfall%20Soil%20Losses.pdf | Table 5 (pp. 22–24) soil loss ratios by crop stage for maize, soybean, small grain and potato; Table 5-B and 5-C (p. 26) meadow, sugar beet and residue cover; Table 3 (p. 12) LS factor by slope | `usda-ah537-tables.txt` |
| USDA NRCS Conservation Practice Standard 328, Conservation Crop Rotation (Sept 2014) | https://www.nrcs.usda.gov/sites/default/files/2022-09/Conservation_Crop_Rotation_328_CPS.pdf | p. 328-3: three years or longer between plantings of the same family, at least three families | `nrcs-cps-328.txt` |
| Mohler and Johnson, eds. (2009), SARE "Crop Rotation on Organic Farms: A Planning Manual" (NRAES-177) | https://www.sare.org/wp-content/uploads/Crop-Rotation-on-Organic-Farms.pdf | Sidebar 5.4, p. 70: four to five years for most soilborne diseases; Appendix 3, pp. 125–136: return times per crop and disease | `sare-crop-rotation-organic.txt` |
| Lundvall, Martins, Sawyer (2021), ISU final report to the Leopold Center "Integrating Rye Seed Production and Red Clover into Corn Systems and Nitrogen Management" | https://www.agronext.iastate.edu/soilfertility/info/Final%20Report%20Corn%20N%20with%20Rye-Red%20Clover-ForSFWebSite.pdf | p. 7 and p. 9: red clover supplied about 50 lb N/acre fertilizer equivalent to the following maize (`nitrogen.credit.red-clover.us-ia`) | `isu-rye-red-clover-2021.txt` |
| Łopatka, Koza, Jadczyszyn, Stuczyński (2011), "Ocena ryzyka zagrożenia erozją wodną w Polsce na podstawie modelu USLE", Studia i Raporty IUNG-PIB 27(1) | https://iung.pl/sir/zeszyt27_13.pdf | Tabela 1, PDF p. 5 (printed p. 155): annual C factor 0.15 for 'Strączkowe' (`erosion.cAnnual.field-pea.pl`) and for 'Zboża ozime, rzepak ozimy' (`erosion.cAnnual.winter-rapeseed.pl`) | `iung-lopatka-2011-usle-c.txt` |
| Podleśny, Leszczyńska (IUNG-PIB, 2025), slides "Międzyplony i ich znaczenie w produkcji rolniczej" | https://www.iung.pl/wp-content/uploads/2026/03/Prezentacja-miedzyplony-2025.pdf | slide 19: 'Międzyplony na zielony nawóz' +0.63 / +0.70 / +0.77 t/ha for light / medium / heavy soil (Kundler 1981), used for `humus.coef.phacelia.pl` and `humus.coef.white-mustard.pl`; slide 22 lists both among stubble catch crops | `iung-podlesny-2025-miedzyplony.txt` |
| Körschens, Rogasik, Schulz (2005), "Bilanzierung und Richtwerte organischer Bodensubstanz", Landbauforschung Völkenrode 55(1) | https://literatur.thuenen.de/digbib_extern/bitv/zi036604.pdf | Tabelle 1, PDF p. 6: the VDLUFA (2004) table that the IUNG slide reproduces, used to check the row labels of the `humus.vdlufa.*` rows | `korschens-2005-vdlufa-table1.txt` |

### Choices the team made on top of the sources

| Row | What we did |
|---|---|
| `nitrogen.credit.alfalfa.us-ia` | 145–170 lb N/acre is our subtraction: continuous maize 170 minus first-year maize after alfalfa 0–25, both from Sawyer (2004). |
| `nitrogen.credit.alfalfaSecondYear.us-ia` | reuses the soybean credit values because Sawyer (2006) says the N response is the same. |
| Iowa N units | kept in lb N/acre as printed; 1 lb/acre = 1.121 kg/ha. Polish rows are in kg N/ha. |
| `humus.coef.*.pl` | the slide prints the unit column as "1ha". We read the values as tonnes of soil organic matter per hectare per crop-year, which is how the Code states them. A mentor should confirm. Rows for US crops (soybean, oats, alfalfa, red clover) borrow the Polish coefficients. |
| `erosion.ls.slopeLength75ft` | the app does not know slope length, so we use the 75 ft column of Table 3, the one closest to the 72.6 ft unit plot. |
| `erosion.slr.sugar-beet` | Handbook 537 has no sugar beet data and points to potatoes without the ridging credit, so the row repeats Table 5 line 159. |
| `erosion.slr.smallGrain.conventional` | winter grain row; oats and spring barley use it as the nearest row. The engine does not read it for winter rapeseed (`SMALL_GRAINS` in `src/engine/rules.ts`). IUNG-PIB (Łopatka et al. 2011, Tabela 1) puts winter rapeseed in one group with winter cereals ('Zboża ozime, rzepak ozimy', C 0.15), which is a sourced basis if O3 and the pitch owner decide to read the row for rapeseed. |
| `erosion.cAnnual.*.pl` | annual C factors per crop group from the Polish USLE model, not split by crop stage like the AH 537 rows. Since D54 (the user's decision, Sun 15 Nov) the engine uses one for a main crop that has no AH 537 stage row, for both its crop and residue months, and the card names the crop in its gaps (`gap.erosion-annual-c`): two methods side by side, said on the card. |
| `humus.coef.phacelia.pl`, `humus.coef.white-mustard.pl` | the slide row is for catch crops ploughed in as green manure in general; we use it for both species because slide 22 lists them as stubble catch crops. No black earth value on the slide, so the key is left out (the engine reads the medium class). |
| `humus.vdlufa.stubbleCatchCrops`, `humus.vdlufa.undersownCatchCrops` | renamed from `humus.vdlufa.springMixtures` and `humus.vdlufa.fallow` (Sun 15 Nov): the IUNG slide labels these rows 'Mieszanki jare' and 'ugory', but the VDLUFA 2004 table it reproduces (Körschens et al. 2005) has 'Stoppelfrüchte' and 'Untersaaten' with the same values in the same order. No code read the old ids. Two more differences for a mentor: the slide prints sugar and fodder beet as -700, the original -760; and the slide's 'jako poplon' (300/400) is 'bei Gründeckfrucht' (sown under a green nurse crop) in the original. |
| `pestBreak.*` | no source says "never". Every interval is a recommendation, so the engine should score a violation and not drop the rotation (SPEC section 8, step 4). |

### Missing: soil health tables

- Red clover cover crop N credit for Iowa: no ISU document with a number was opened. The Polish legume catch crop row (`nitrogen.credit.legumeCatchCrop.pl`, 15–20 kg N/ha) is the only cover crop credit.
- Leaching adjustment of the N credit by soil texture: none of the opened sources gives numbers. The engine can only use rain in the bare months.
- NRCS Soil Conditioning Index (USA organic matter): not opened. Iowa organic matter has only the borrowed Polish and VDLUFA coefficients.
- Climate adjustment of the humus balance (warm and wet soils): no source with numbers opened.
- Humus coefficients for catch crops in the Code of Good Agricultural Practice 2004: it has no catch crop row. Phacelia and white mustard now use the IUNG-PIB 2025 slide (see above). Cereal rye cover can use `humus.vdlufa.winterCatchCrops`.
- A range for `nitrogen.credit.field-pea.pl`: no Polish source gives one (Sun 15 Nov). The nitrates programmes give one value each (30 kg in Dz.U. 2018 poz. 1339 and 2020 poz. 243, 25 kg in 2023 poz. 244). The '50–80 kg N/ha' in pea guides (KPODR 2018, COBORU Łódź 2025) is N held in the residues, not the credit, so the row stays a single value.
- RUSLE Handbook 703: the PDF on the ARS site opened, but it is a scan with no text layer, so the C values come from Handbook 537 (the earlier USLE handbook by the same agency).
- Erosion rows for winter rapeseed, field pea, white mustard and phacelia: Handbook 537 has none. Field pea and winter rapeseed now have annual C factors from IUNG-PIB 2011 (`erosion.cAnnual.*.pl`); phacelia and white mustard as catch crops still have no sourced value (checked Sun 15 Nov: LfL Bayern ABAG 2023 Tab. 7 and IUNG-PIB 2011 have no catch crop row; Panagos et al. 2015 could not be opened). Table 5-C rows for 80–95 % residue cover are left out because the extracted text of those rows is not clear.
- Pest-cycle break from a Polish source (rapeseed and sugar beet intervals): not opened. The Brassicaceae row comes from vegetable crucifer diseases in the northeastern United States.

## Added after the review of PR #27 (O4-B0 1b)

- `goals.soilIndicator.weights` (equal, 0.25 each) and `goals.ruleOfThumbRange.share` (0.15) move two numbers from the engine code into this table; both come from SPEC section 7.
- Winter rapeseed has no erosion row of its own: `erosion.slr.smallGrain.conventional` is used as the nearest row, as its `appliesTo` says. The "Missing" line above means "no row of its own".
- `humus.coef.red-clover.pl` is the main-crop value. Red clover appears only as an Iowa cover crop, and the engine reads Polish humus rows only, so the row is not used for it.

### Also missing

- A mapping from sand share to the Polish soil classes (light, medium, heavy) of the humus coefficients; the engine uses the medium class.
- An erosion value for the months a cover crop is in the ground, other than the two meadow and rye-cover rows.
- A mapping from calendar months to the crop stages of Handbook 537 Table 5; the engine averages the stage values.
- Humus coefficients that apply to Iowa (NRCS Soil Conditioning Index not opened), so organic matter is left out for US fields.
- `nitrogen.leachingRainMm`, `nitrogen.leachingMaxLoss`, `nitrogen.leachingBySand`: no source opened with numbers.

## Follow-ups from issue #79 (O4-B0 1c)

- `hazards.frost.generalThresholdDays` is now 10, a team rule of thumb: with 0 every April in Iowa was a frost month. Numbers in the row's locator.
- `hazards.gaez.notSuitableBelowSI`: the check is "at or below", on the 0–100 SI scale. `hazards.gaez.classes` uses stable keys (`veryHigh` … `notSuitable`).
- Relabelled as what they are: `nitrogen.credit.alfalfa.us-ia` and `nitrogen.credit.alfalfaSecondYear.us-ia` ("team calculation from …"), `erosion.ls.slopeLength75ft` ("team choice of the 75 ft column from …"), `humus.coef.soybean.pl`, `humus.coef.alfalfa.pl`, `humus.coef.red-clover.pl` ("borrowed from …").
- Istanbulluoglu et al. 2010 (an abstract on a third-party index, R10) is not used anywhere (D37).

## Seasonal crop water need (`water.json`)

Read by the water priority (SPEC section 7, O3's #119). One row per crop, `water.needMm.<cropId>`, and one per water need class, `water.needMm.low|medium|high`, as a fallback.

| Source | URL | Used for |
|---|---|---|
| FAO Irrigation Water Management Training Manual No. 3, chapter 3, Table 14 "Indicative values of crop water needs" | https://www.fao.org/4/s2022e/s2022e07.htm | mm per total growing period: Barley/Oats/Wheat 450–650, Maize 500–800, Alfalfa 800–1600, Pea 350–500, Potato 500–700, Soybean 450–700, Sugarbeet 550–750; excerpt `data/samples/rules/fao-manual3-table14-crop-water-needs.txt` |
| FAO Irrigation and Drainage Paper 24, Table 20, page 36 (PDF page 46) | https://www.fao.org/3/s8376e/s8376e.pdf | rye (Grains, small, 300–450 mm) and winter rapeseed (Oil seeds, 300–600 mm), which have no Table 14 row; excerpt `data/samples/rules/fao-paper24-table20.txt` (the PDF is a scan, so the excerpt is its OCR text) |

- **Crop rows:** the midpoint of each range. FAO's text above Table 14 says to use the minimum for a short growing period, the maximum for a long one and "an average value … with a medium total growing period". The midpoint is that average. It is labelled "team calculation from …", because the choice of a medium season is ours.
- **Class rows:** the mean of the crop midpoints in each class, with the class taken from `data/crops`:
  - low 417 mm (field pea, rye, winter rapeseed);
  - medium 579 mm (wheat, oats, spring barley, soybean, potato, sugar beet);
  - high 925 mm (maize, alfalfa).

  The engine should prefer a crop's own row. The high class mixes maize (650) and alfalfa (1200).
- **Missing:** cover crops have no water need class and no row (they are not harvested; contract PR #44).
