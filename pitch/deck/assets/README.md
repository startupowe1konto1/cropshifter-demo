# Assets

Every file under `pitch/deck/assets/`. Credits for the last slide: "Imagery: NASA GIBS", "Spacecraft model: Landsat 8, NASA 3D Resources", "Typeface: Inter, SIL Open Font License 1.1".

NASA imagery and models are not copyrighted (NASA media usage guidelines). Credit "NASA" where a credit is shown.

| File | Source | Date | Licence | Credit line |
|---|---|---|---|---|
| `img/poznan-local.png` | NASA GIBS WMS, layer `HLS_S30_Nadir_BRDF_Adjusted_Reflectance`, TIME 2025-06-13, BBOX 52.3995,17.0205,52.5190,17.2166, 444 x 444 px. `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi` | Fetched 2026-11-15 by `scripts/fetch-imagery.sh`; imagery date 2025-06-13 | NASA public domain (NASA media usage guidelines) | Imagery: NASA GIBS |
| `img/poznan-region.jpg` | NASA GIBS WMS, layer `MODIS_Terra_CorrectedReflectance_TrueColor`, TIME 2025-03-20, BBOX 50.4593,13.8378,54.4593,20.3992, 2048 x 2048 px | Fetched 2026-11-15 by `scripts/fetch-imagery.sh`; imagery date 2025-03-20 (2025-06-13 had about a third cloud) | NASA public domain (NASA media usage guidelines) | Imagery: NASA GIBS |
| `img/europe-wide.jpg` | NASA GIBS WMS, layer `BlueMarble_ShadedRelief_Bathymetry`, no TIME, BBOX 36,-20,66,50, 3584 x 1536 px. The box fills the frame of the `europe` view in `src/scene.js` (see the comment in `scripts/fetch-imagery.sh`) | Fetched 2026-11-15 by the lead session; no imagery date (static layer) | NASA public domain (NASA media usage guidelines) | Imagery: NASA GIBS |
| `img/earth.jpg` | NASA Blue Marble, served through NASA GIBS | unknown | NASA public domain (NASA media usage guidelines) | Imagery: NASA GIBS |
| `img/iowa-local-native.png` | NASA GIBS (prototype imagery, Iowa field) | unknown | NASA public domain (NASA media usage guidelines) | Imagery: NASA GIBS |
| `img/iowa-region.jpg` | NASA GIBS (prototype imagery, Iowa field) | unknown | NASA public domain (NASA media usage guidelines) | Imagery: NASA GIBS |
| `img/iowa-wide.jpg` | NASA GIBS (prototype imagery, Iowa field) | unknown | NASA public domain (NASA media usage guidelines) | Imagery: NASA GIBS |
| `glb/landsat8.glb` | NASA 3D Resources, `Landsat 8/Landsat 8.glb`, https://github.com/nasa/NASA-3D-Resources. Draco-compressed, no NASA insignia | unknown | NASA public domain (NASA media usage guidelines) | Spacecraft model: Landsat 8, NASA 3D Resources |
| Caveat (handwriting font, the notebook on slide 2 only) | npm `@fontsource/caveat` 5.3.0, not copied into `assets/` | 2026-11-15 | SIL Open Font License 1.1 | Typeface: Caveat, SIL Open Font License 1.1 |
| Inter (variable font, used by the slides) | npm `@fontsource-variable/inter` 5.3.0, not copied into `assets/`; see the npm package | unknown | SIL Open Font License 1.1 | Typeface: Inter, SIL Open Font License 1.1 |

Re-fetch the three `poznan-*` and `europe-wide` files with `sh scripts/fetch-imagery.sh` from `pitch/deck`.
