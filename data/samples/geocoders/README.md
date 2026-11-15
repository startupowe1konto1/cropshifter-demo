# Geocoder samples (address search)

Saved with `curl -s` on Sat 14 Nov 2026, 17:40 UTC (18:40 CET). Used by `src/map/search/*.test.ts`. No personal data in the requests; Nominatim was called with the generic User-Agent `field-shift-hackathon/0.1` and no email.

| File | URL |
|---|---|
| `gugik-address-swarzedz-rynek-1.json` | `https://services.gugik.gov.pl/uug/?request=GetAddress&address=Swarz%C4%99dz%2C%20Rynek%201&srid=4326` |
| `gugik-city-swarzedz.json` | `https://services.gugik.gov.pl/uug/?request=GetAddress&address=Swarz%C4%99dz&srid=4326` |
| `gugik-empty.json` | `https://services.gugik.gov.pl/uug/?request=GetAddress&address=Qwxzv%20Nieistniej%C4%85ce%201&srid=4326` |
| `census-iowa-capitol.json` | `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=1007%20E%20Grand%20Ave%2C%20Des%20Moines%2C%20IA%2050319&benchmark=Public_AR_Current&format=json` |
| `census-empty.json` | `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=99999%20Nowhere%20Rd%2C%20Qwxzv%2C%20IA%2050000&benchmark=Public_AR_Current&format=json` |
| `nominatim-ames-iowa.json` | `https://nominatim.openstreetmap.org/search?q=Ames%2C%20Iowa&format=jsonv2&limit=5` |
| `nominatim-empty.json` | `https://nominatim.openstreetmap.org/search?q=Qwxzvqq%20Nowhereplace&format=jsonv2&limit=5` |
| `nominatim-220th-street-nevada-iowa.json` | `https://nominatim.openstreetmap.org/search?q=220th%20Street%2C%20Nevada%2C%20Iowa&format=jsonv2&limit=5` (saved Sat 14 Nov, 23:45 CET, User-Agent `field-shift-tool-dev`; the address the pitch animation types, next to the Iowa demo field, see `src/map/demoSnap.ts`) |

What the answers show:

- GUGiK UUG: `results` is an object keyed `"1"`, `"2"`, ..., or `null` when nothing matches. `x` and `y` are strings; with `srid=4326`, `x` is longitude and `y` latitude (without `srid` they are EPSG:2180). `type` is `address`, `street` or `city`, and the fields differ by type (`street`/`number`/`code` for an address, `commune`/`county`/`voivodeship` for a city).
- US Census: matches are in `result.addressMatches`; `coordinates.x` is longitude, `coordinates.y` latitude, both numbers. No match gives an empty array.
- Nominatim: a JSON array; `lat` and `lon` are strings, `display_name` is the full label. No match gives `[]`.

CORS, checked the same day with `curl -sI -H "Origin: http://localhost:5172" <url>`:

- GUGiK UUG: `Access-Control-Allow-Origin: *`.
- Nominatim: `access-control-allow-origin: *`.
- US Census: no `Access-Control-Allow-Origin` for `http://localhost:5172` or a `*.vercel.app` origin. It sends one only for census.gov origins (`Vary: Origin`). The browser cannot read its answers, so the app sends US addresses to Nominatim. The parser stays, tested, for a future server-side call.
