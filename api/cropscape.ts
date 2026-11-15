// Vercel serverless proxy for USDA CropScape GetCDLValue (task O4-A5, DECISIONS D10: the one allowed function).
// GET /api/cropscape?year=2025&x=205798.8&y=2117034.5  (x, y in EPSG:5070 metres)  ->  the CropScape XML body.
// It forwards one call and nothing else: no other host, no other path, parameters checked as numbers.
const ENDPOINT = 'https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue';
const TIMEOUT_MS = 20_000;

function bad(message: string, status = 400): Response {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const year = Number(params.get('year'));
  const x = Number(params.get('x'));
  const y = Number(params.get('y'));
  // CDL covers 2008 onward; EPSG:5070 metres of the conterminous USA stay well inside these bounds.
  if (!Number.isInteger(year) || year < 2008 || year > 2100) return bad('year must be a CDL year (2008 or later)');
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 3_000_000 || y < 0 || y > 4_000_000) {
    return bad('x and y must be EPSG:5070 metres inside the conterminous USA');
  }
  const url = `${ENDPOINT}?year=${year}&x=${x.toFixed(1)}&y=${y.toFixed(1)}`;
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await upstream.text();
    if (!upstream.ok) return bad(`CropScape answered HTTP ${upstream.status}`, 502);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        // a CDL year does not change once published: let the CDN keep answers for a day
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  } catch (e) {
    return bad(`CropScape did not answer: ${e instanceof Error ? e.message : String(e)}`, 504);
  }
}
