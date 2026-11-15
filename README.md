# CropShifter

CropShifter helps a farmer pick a crop rotation that keeps the soil healthy and copes with the local climate, using NASA data (NASA POWER, SMAP via GIBS) together with soil, crop-history and price data. Built by team Vibecodersi for the NASA Space Apps Challenge 2026, challenge "Field Shift: Adapting Farms with NASA Data".

This repository holds only the web app, ready to deploy on Vercel.

## Demo locations

Step 1 has two buttons for the fields from our presentation:

- **Poznań, Poland**: an 8 ha field near Poznań, with its land-register parcel.
- **Story County, Iowa**: a 24 ha field between Ames and Nevada.

A link can open straight on a demo field: `/?demo=poznan` or `/?demo=iowa` (add `&lang=pl` for Polish).

You can still search for any address or tap the map, but soil, slope and crop-history data are precomputed only for these two fields.

## Run locally

```bash
npm ci
npm run dev        # http://localhost:5171
npm run test
npm run build      # output in dist/
```

## Deploy on Vercel

Import this repository in Vercel. `vercel.json` sets the framework (Vite), the build command (`npm run build`) and the output folder (`dist`). No environment variables are needed. `api/cropscape.ts` becomes a serverless function that forwards one request type to USDA CropScape.

## Notes

- Income figures replay past years at today's prices. They are not a forecast.
- The tool supports the farmer's judgment and does not replace it.
