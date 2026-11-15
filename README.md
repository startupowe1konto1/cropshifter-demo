# CropShifter

CropShifter helps a farmer pick a crop rotation that keeps the soil healthy and copes with the local climate, using NASA data (NASA POWER climate records and NASADEM slope) together with soil, crop-history and price data. Built by team Vibecodersi for the NASA Space Apps Challenge 2026, challenge "Field Shift: Adapting Farms with NASA Data".

This repository holds only the web app, ready to deploy on Vercel. The full source, spec, decisions and tests are in the main repository: https://github.com/startupowe1konto1/nasa-space-apps-hackathon

## Demo locations

Step 1 has two buttons for the fields from our presentation:

- **Uzarzewo near Poznań, Poland**: land-register parcel 302116_5.0015.28/1 (about 22 ha), the field shown in the presentation.
- **Story County, Iowa**: a 24 ha field between Ames and Nevada.

A link can open straight on a demo field: `/?demo=poznan` or `/?demo=iowa` (add `&lang=pl` for Polish).

You can still search for any address or tap the map, but soil, slope and crop-history data are precomputed only for these two fields.

## Pitch deck

The 7-slide pitch deck (PDF) lives in the main repository: https://github.com/startupowe1konto1/NASA-Space-Apps-Hackathon/blob/main/pitch/out/deck.pdf. The old links under `/pitch/` on this site redirect there.

## NASA data

| Dataset | What the app uses it for |
|---|---|
| [NASA POWER](https://power.larc.nasa.gov/) daily and monthly agroclimatology, 1981–2025, about 50 km grid (model estimate) | Drought, heat and frost years for the field; water balance; climate resilience score; the hazard marks on the calendar; yield loss in the income replay |
| NASA POWER climatology | Climate features used to find similar fields |
| [NASADEM](https://planetarycomputer.microsoft.com/dataset/nasadem) elevation, via Microsoft Planetary Computer | Slope of the field (our calculation), which feeds the erosion risk |
| NASA GIBS imagery: HLS (Harmonized Landsat Sentinel-2), MODIS Terra, Blue Marble | Background imagery in the pitch deck |

HLS S30 is built from ESA Sentinel-2 data.

## Other data

ISRIC SoilGrids 2.0, FAO GAEZ v4, USDA NASS Cropland Data Layer (CropScape) and Quick Stats, USDA NRCS SSURGO and the Iowa FY2026 program booklet, Iowa State University Extension cost and custom rate tables, GUGiK ULDK (Polish parcel outlines), Statistics Poland (GUS) yields and prices, Polish Ministry of Agriculture ZSRIR prices and 2026 eco-scheme rates, Dziennik Ustaw, WODR Poznań crop budgets, Eurostat `apro_cpnhr`, OpenStreetMap tiles and Nominatim, US Census geocoder. The full list with URLs is in each module's `datasets.ts` and on screen. Every crop rule, crop trait, price and payment rate in `data/` carries the title, URL and page of the document it was copied from; `npm run validate:data` rejects a row without one.

## Use of AI

The team wrote the code, data tables and documents with Claude Code (Anthropic, Claude Opus 5.5) as a coding assistant, including subagents for research, tests and reviews. People chose the challenge, the idea, the method and every decision in [docs/DECISIONS.md](https://github.com/startupowe1konto1/nasa-space-apps-hackathon/blob/main/docs/DECISIONS.md), and reviewed every merged pull request. Each team member logged their AI use, what a human checked and what went wrong in [docs/ai-usage/](https://github.com/startupowe1konto1/nasa-space-apps-hackathon/tree/main/docs/ai-usage). No AI-generated images, video or audio are used in the app or the deck; the deck imagery comes from NASA GIBS and NASA 3D Resources.

## Credits

Imagery: NASA GIBS. Spacecraft model: Landsat 8, NASA 3D Resources. Typefaces: Inter and Caveat, SIL Open Font License 1.1. Map tiles © OpenStreetMap contributors. Libraries: React, Leaflet, Leaflet-Geoman, proj4, zod, zustand, Three.js.

No NASA logo or insignia is used.

## Run locally

```bash
npm ci
npm run dev        # http://localhost:5171
npm run test
npm run build      # output in dist/
```

## Deploy on Vercel

Import this repository in Vercel. `vercel.json` sets the framework (Vite), the build command and the output folder (`dist`). The build command runs `vite build`. `/pitch/` and `/pitch/deck.pdf` redirect to the deck PDF in the main repository. No environment variables are needed. `api/cropscape.ts` becomes a serverless function that forwards one request type to USDA CropScape.

## Notes

- Income figures replay past years at today's prices. They are not a forecast.
- The tool supports the farmer's judgment and does not replace it.

## License

Code, rule tables and documents: Apache License 2.0, see [LICENSE](LICENSE). Copyright 2026 team Vibecodersi. Data, imagery, fonts and libraries keep their own terms, listed in [DATA-LICENSES.md](DATA-LICENSES.md).
