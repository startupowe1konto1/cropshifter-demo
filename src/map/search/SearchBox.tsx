// Address or place search above the map. One result moves the map at once; several are listed to pick from.
// Button names stay generic or carry the geocoder's label: e2e finds the demo buttons by substring.
import { useId, useRef, useState } from 'react';
import { t } from '../../app/i18n';
import { useOnline } from '../../app/useOnline';
import { SourceError } from '../../contracts';
import { StateBoundary } from '../../ui-kit/StateBoundary';
import { GUGIK_SOURCE } from './gugik';
import { NOMINATIM_SOURCE, nominatimThrottle } from './nominatim';
import type { Place } from './place';
import { isPolishQuery, searchPlaces } from './search';
import type { Throttle } from './throttle';

const BUTTON =
  'min-h-11 rounded-lg border border-zinc-300 bg-white px-4 text-base font-medium text-zinc-900 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 active:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60';

type Search =
  | { kind: 'idle' }
  | { kind: 'loading'; source: string }
  | { kind: 'list'; places: Place[] }
  | { kind: 'moved'; label: string }
  | { kind: 'none' }
  | { kind: 'error'; source: string; reason: string };

export function SearchBox({ onPick, throttle = nominatimThrottle }: { onPick: (place: Place) => void; throttle?: Throttle }) {
  const online = useOnline();
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<Search>({ kind: 'idle' });
  const [fromNominatim, setFromNominatim] = useState(false);
  const latest = useRef(0); // only the newest search may change the state

  const pick = (place: Place) => {
    onPick(place);
    setSearch({ kind: 'moved', label: place.label });
  };

  const find = async () => {
    const wanted = query.trim();
    if (!wanted) return;
    const request = ++latest.current;
    const firstSource = isPolishQuery(wanted) ? GUGIK_SOURCE : NOMINATIM_SOURCE;
    setFromNominatim(false);
    setSearch({ kind: 'loading', source: firstSource });
    try {
      const { places, source } = await searchPlaces(wanted, fetch, throttle);
      if (request !== latest.current) return;
      setFromNominatim(source === NOMINATIM_SOURCE);
      if (places.length === 0) setSearch({ kind: 'none' });
      else if (places.length === 1) pick(places[0]!);
      else setSearch({ kind: 'list', places });
    } catch (error) {
      if (request !== latest.current) return;
      setSearch({
        kind: 'error',
        source: error instanceof SourceError ? error.source : firstSource,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <section className="grid gap-2">
      <h2 className="text-lg font-semibold text-zinc-900">{t('search.title')}</h2>
      <form
        role="search"
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void find();
        }}
      >
        <div className="grid flex-1 gap-1">
          <label htmlFor={inputId} className="text-base font-medium text-zinc-900">
            {t('search.label')}
          </label>
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            enterKeyHint="search"
            className="min-h-11 rounded-lg border border-zinc-400 bg-white px-3 text-base text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
          />
        </div>
        <button type="submit" className={BUTTON} disabled={!online || search.kind === 'loading'}>
          {t('search.button')}
        </button>
      </form>

      {!online ? <StateBoundary state="offline">{null}</StateBoundary> : null}
      {search.kind === 'loading' ? (
        <StateBoundary state="loading" source={search.source}>
          {null}
        </StateBoundary>
      ) : null}
      {search.kind === 'none' ? (
        <StateBoundary state="no-data" reason={t('search.none')}>
          {null}
        </StateBoundary>
      ) : null}
      {search.kind === 'error' ? (
        <StateBoundary state="error" source={search.source} reason={search.reason} onRetry={() => void find()}>
          {null}
        </StateBoundary>
      ) : null}
      {search.kind === 'list' ? (
        <ul aria-label={t('search.results')} className="grid gap-2">
          {search.places.map((place, i) => (
            <li key={`${place.lat},${place.lon},${i}`}>
              <button type="button" className={`${BUTTON} w-full py-2 text-left`} onClick={() => pick(place)}>
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {fromNominatim && (search.kind === 'list' || search.kind === 'moved' || search.kind === 'none') ? (
        <p className="text-sm text-zinc-600">{t('search.attribution')}</p>
      ) : null}
      {search.kind === 'moved' ? (
        <p role="status" className="text-base text-zinc-950">
          {t('search.moved', { label: search.label })}
        </p>
      ) : null}
    </section>
  );
}
