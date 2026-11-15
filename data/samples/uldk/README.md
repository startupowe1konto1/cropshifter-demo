# ULDK samples (GUGiK parcel service)

Saved with `curl -s` on Sat 14 Nov 2026, 16:49 UTC (17:49 CET), `\r` stripped. Used by `src/map/parcels/*.test.ts`.
Service and request list: https://uldk.gugik.gov.pl/ (no login, `Access-Control-Allow-Origin: *`).

| File | URL |
|---|---|
| `parcel-by-xy-poznan-srid4326.txt` | `https://uldk.gugik.gov.pl/?request=GetParcelByXY&xy=17.1,52.45,4326&result=geom_wkt,teryt&srid=4326` |
| `parcel-by-xy-poznan-srid2180.txt` | `https://uldk.gugik.gov.pl/?request=GetParcelByXY&xy=17.1,52.45,4326&result=geom_wkt,teryt` |
| `parcel-by-id-428-1-srid4326.txt` | `https://uldk.gugik.gov.pl/?request=GetParcelById&id=302116_5.0008.428/1&result=geom_wkt,teryt&srid=4326` |
| `parcel-by-id-428-1-srid2180.txt` | `https://uldk.gugik.gov.pl/?request=GetParcelById&id=302116_5.0008.428/1&result=geom_wkt,teryt` |
| `not-found-by-xy-sea.txt` | `https://uldk.gugik.gov.pl/?request=GetParcelByXY&xy=16.5,54.85,4326&result=geom_wkt,teryt&srid=4326` (Baltic Sea) |
| `not-found-by-id.txt` | `https://uldk.gugik.gov.pl/?request=GetParcelById&id=302116_5.0008.999999/9&result=geom_wkt,teryt&srid=4326` |

What the answers show:

- Plain text, HTTP 200 in every case. First line `0` when a parcel was found, then one line `WKT|teryt`.
- The WKT starts with an SRID prefix (`SRID=4326;` or `SRID=2180;`). Without `srid=` the service answers in EPSG:2180 (easting first, then northing).
- `xy=<lon>,<lat>,4326` takes a WGS84 point directly.
- No parcel: first line `-1 brak wyników` ("no results"), then a Polish note. A malformed request (`xy=abc`) gets the same `-1` answer.
- URL-encoded `,` and `/` in the parameters are accepted.
- The 2180 and 4326 files hold the same parcel, so their vertices pair up one to one. `reproject.test.ts` uses them as the known coordinate pairs.
