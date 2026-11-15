// Polish parcel by number (ULDK), plus the status of the last map tap in Poland (see tap.ts).
// Button names stay generic: e2e finds the demo buttons by substring, so no button here may name a demo field.
import { useEffect, useId, useState } from 'react';
import { t } from '../../app/i18n';
import { useAppStore } from '../../app/store';
import { useOnline } from '../../app/useOnline';
import { StateBoundary } from '../../ui-kit/StateBoundary';
import { cancelPendingTap, useParcelTap } from './tap';
import { ULDK_SOURCE, getParcelById } from './uldk';

const BUTTON =
  'min-h-11 rounded-lg border border-zinc-300 bg-white px-4 text-base font-medium text-zinc-900 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 active:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60';

type Search =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'found'; teryt: string }
  | { kind: 'not-found' }
  | { kind: 'error'; reason: string };

export function ParcelSearch() {
  const online = useOnline();
  const inputId = useId();
  const hintId = useId();
  const tap = useParcelTap((s) => s.tap);
  const [id, setId] = useState('');
  const [search, setSearch] = useState<Search>({ kind: 'idle' });

  // A newer map tap replaces the result of an older search.
  useEffect(() => {
    if (tap.status !== 'idle') setSearch({ kind: 'idle' });
  }, [tap]);

  const find = async () => {
    const wanted = id.trim();
    if (!wanted) return;
    cancelPendingTap(); // a tap still waiting for ULDK must not replace the parcel found by number
    setSearch({ kind: 'loading' });
    try {
      const field = await getParcelById(wanted);
      if (!field) {
        setSearch({ kind: 'not-found' });
        return;
      }
      useAppStore.getState().addField(field);
      setSearch({ kind: 'found', teryt: field.parcelIds?.[0] ?? wanted });
    } catch (error) {
      setSearch({ kind: 'error', reason: error instanceof Error ? error.message : String(error) });
    }
  };

  const loading = search.kind === 'loading' || tap.status === 'loading';
  const added = search.kind === 'found' ? search.teryt : tap.status === 'parcel' ? tap.teryt : null;

  return (
    <section className="grid gap-2">
      <h2 className="text-lg font-semibold text-zinc-900">{t('parcels.search.title')}</h2>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void find();
        }}
      >
        <div className="grid flex-1 gap-1">
          <label htmlFor={inputId} className="text-base font-medium text-zinc-900">
            {t('parcels.search.label')}
          </label>
          <input
            id={inputId}
            aria-describedby={hintId}
            value={id}
            onChange={(e) => setId(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="min-h-11 rounded-lg border border-zinc-400 bg-white px-3 text-base text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
          />
        </div>
        <button type="submit" className={BUTTON} disabled={!online || search.kind === 'loading'}>
          {t('parcels.search.button')}
        </button>
      </form>
      <p id={hintId} className="text-sm text-zinc-600">
        {t('parcels.search.hint')}
      </p>

      {!online ? <StateBoundary state="offline">{null}</StateBoundary> : null}
      {loading ? (
        <StateBoundary state="loading" source={ULDK_SOURCE}>
          {null}
        </StateBoundary>
      ) : null}
      {search.kind === 'not-found' ? (
        <StateBoundary state="no-data" reason={t('parcels.notFound')}>
          {null}
        </StateBoundary>
      ) : null}
      {search.kind === 'error' ? (
        <StateBoundary state="error" source={ULDK_SOURCE} reason={search.reason} onRetry={() => void find()}>
          {null}
        </StateBoundary>
      ) : null}
      {tap.status === 'fallback' ? (
        <p role="status" className="text-base text-zinc-700">
          {tap.reason === 'error'
            ? t('parcels.tap.error', { source: ULDK_SOURCE })
            : t(tap.reason === 'offline' ? 'parcels.tap.offline' : 'parcels.tap.none')}
        </p>
      ) : null}
      {added && !loading ? (
        <p role="status" className="text-base text-zinc-950">
          {t('parcels.added', { teryt: added })}
        </p>
      ) : null}
    </section>
  );
}
