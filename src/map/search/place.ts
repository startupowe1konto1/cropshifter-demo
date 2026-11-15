// Shared shape of every geocoder answer, and the request helper the clients use.
import { t } from '../../app/i18n';
import { SourceError } from '../../contracts';

/** One place a geocoder found. WGS84. */
export interface Place {
  lat: number;
  lon: number;
  label: string;
}

const TIMEOUT_MS = 15_000;

/** JSON body of a geocoder answer; anything that is not JSON is a SourceError for that source. */
export function readJson(source: string, body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new SourceError(source, t('search.error.format', { source }));
  }
}

/** A coordinate given as a number or a numeric string. */
export function coordinate(source: string, value: unknown): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new SourceError(source, t('search.error.format', { source }));
  return n;
}

/** Body text of a GET request; a network failure or an HTTP error is a SourceError for that source. */
export async function getText(source: string, url: string, fetchImpl: typeof fetch): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw new SourceError(source, error instanceof Error ? error.message : String(error));
  }
  if (!res.ok) throw new SourceError(source, t('search.error.http', { source, status: res.status }));
  return res.text();
}
