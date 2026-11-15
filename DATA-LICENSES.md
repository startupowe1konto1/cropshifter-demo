# Data and third-party licenses

CropShifter's own code, rule tables and documents are released under the Apache License 2.0 (see `LICENSE`). Copyright 2026 team Vibecodersi: Mikołaj Konieczny, Mateusz Wojciechowski, Oskar Pelzer, Wojciech Rudnicki.

The data, imagery, fonts and libraries below belong to their owners and keep their own terms. The app shows the source of every number on screen. This file lists the terms we found for each source, with the page we read them on. Where a provider publishes no named license, the line says so and gives the condition they do state.

## NASA data

NASA data and imagery are free to use without restriction (NASA open data and media usage guidelines). NASA does not endorse this project, and no NASA logo or insignia is used.

| Source | Use in CropShifter | Terms |
|---|---|---|
| NASA POWER, monthly and daily agroclimatology and climatology | Climate record of the field, drought, heat and frost years, similar fields | Free to use. The POWER project asks every work that uses POWER data to carry its acknowledgment, which starts "The data was obtained from National Aeronautics and Space Administration (NASA) Langley Research Center's" and names the POWER project. Full text: https://power.larc.nasa.gov/docs/referencing/ |
| NASADEM, via Microsoft Planetary Computer | Slope of the field | NASA data, no restrictions |
| NASA GIBS imagery (HLS, MODIS Terra, Blue Marble, SMAP L4) | Imagery in the pitch deck | NASA data, no restrictions. HLS S30 is built from Copernicus Sentinel-2 data (ESA) |
| NASA 3D Resources, Landsat 8 model | Spacecraft in the pitch deck | NASA media usage guidelines; the model carries no NASA insignia |

## Other data

| Source | Use in CropShifter | Terms |
|---|---|---|
| ISRIC SoilGrids 2.0 | Soil texture, organic carbon, pH | CC BY 4.0 ("The SoilGrids maps are publicly available ... under the CC-BY 4.0 License", https://www.isric.org/explore/soilgrids/) |
| FAO GAEZ v4 (FAO and IIASA) | Crop suitability at the field (`data/precomputed/gaez.json`) | Credit FAO and IIASA. We did not find a named license on the GAEZ v4 portal (https://gaez.fao.org/). We use the data for a non-commercial, open project and redistribute only the suitability classes for the two demo fields |
| USDA NASS Cropland Data Layer (CropScape), Quick Stats, Crop Values | Crop history and yields in Iowa, prices | US federal government work, public domain in the USA |
| USDA NRCS SSURGO / Soil Data Access, Iowa FY2026 program scenario booklet | Soil in Iowa, payment rates | US federal government work, public domain in the USA |
| US Census geocoder | Address search in the USA | US federal government work, public domain in the USA |
| Iowa State University Extension, Ag Decision Maker A1-20 and A3-10 | Costs and custom rates in Iowa | Single figures copied with title, URL and page in `data/money/`; the documents themselves are not redistributed |
| GUGiK ULDK (Polish land register parcel outlines) | Field outline in Poland | Public service of the Head Office of Geodesy and Cartography, free of charge; source named on screen |
| Statistics Poland (GUS) | Yields and procurement prices in Poland | Reuse allowed provided the source is given (https://stat.gov.pl/copyright); no named license |
| Polish Ministry of Agriculture (ZSRIR prices, 2026 eco-scheme rates), ARiMR, Dziennik Ustaw | Prices and payment rates in Poland | Official acts and documents; single figures copied with their source |
| WODR Poznań crop budgets | Direct costs in Poland | Single figures copied with title, URL and page in `data/money/`; the documents themselves are not redistributed |
| Eurostat `apro_cpnhr` | Yields of similar regions in Europe | Reuse allowed "without any payment or written licence" provided Eurostat is credited and changes are stated (https://ec.europa.eu/eurostat/about-us/policies/copyright) |
| OpenStreetMap tiles and Nominatim | Base map and address search | Map data © OpenStreetMap contributors, Open Database License (https://www.openstreetmap.org/copyright). The map shows this credit |

## Fonts and libraries

| Package | License |
|---|---|
| Inter (`@fontsource-variable/inter`), Caveat (`@fontsource/caveat`) | SIL Open Font License 1.1 |
| React, React DOM, zod, zustand, proj4, Leaflet-Geoman (free), Three.js | MIT |
| Leaflet, proj4leaflet | BSD-2-Clause |

Development tools (Vite, TypeScript, Vitest, Playwright and others) are listed with their licenses in `package-lock.json`; they are not shipped in the app.

## Use of AI

The code, data tables and documents were written with Claude Code (Anthropic) as a coding assistant. See the "Use of AI" section of `README.md` and [docs/ai-usage/](https://github.com/startupowe1konto1/nasa-space-apps-hackathon/tree/main/docs/ai-usage) in the main repository. No AI-generated images, video or audio are used.
