// Step 3: the field's recent crops. Where satellite crop maps exist (USA) the farmer confirms or corrects them;
// elsewhere (most of Poland) the farmer picks the last seasons from crop tiles. The farmer's answer always wins.
import { useCallback, useEffect, useState } from 'react';
import { t } from '../../app/i18n';
import { providers } from '../../app/providers';
import { selectedField, useAppStore } from '../../app/store';
import type { CropId, CropTraits, CropYear, Field, Message } from '../../contracts';
import { SourceError } from '../../contracts';
import { StateBoundary } from '../../ui-kit';
import { cropName } from '../shared/cropName';
import { CropIcon } from './cropIcons';
import { CropPicker } from './CropPicker';

/** The last three seasons, newest first. The current year counts once its harvest is in (from August). */
export function lastSeasons(now: Date = new Date()): number[] {
  const newest = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return [newest, newest - 1, newest - 2];
}

type Load<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'no-data'; reason: Message }
  | { status: 'error'; source: string; reason: string };

const errorOf = (error: unknown, fallbackSource: string): Load<never> => ({
  status: 'error',
  source: error instanceof SourceError ? error.source : fallbackSource,
  reason: error instanceof Error ? error.message : String(error),
});

const byYear = (a: CropYear, b: CropYear) => a.year - b.year;

export function CropsStep() {
  const field = useAppStore(selectedField);
  if (!field) return <p className="text-base text-zinc-700">{t('steps.crops.noField')}</p>;
  return <CropsForField key={field.id} field={field} />;
}

function CropsForField({ field }: { field: Field }) {
  const stored = useAppStore((s) => s.cropHistory[field.id]);
  const setCropHistory = useAppStore((s) => s.setCropHistory);
  const [history, setHistory] = useState<Load<CropYear[]>>({ status: 'loading' });
  const [crops, setCrops] = useState<Load<CropTraits[]>>({ status: 'loading' });

  const load = useCallback(() => {
    let live = true;
    setHistory({ status: 'loading' });
    setCrops({ status: 'loading' });
    providers.context
      .getCropHistory(field)
      .then((r) => {
        if (!live) return;
        if (r.status === 'ready') setHistory({ status: 'ready', data: [...r.data].sort(byYear) });
        else if (r.status === 'error') setHistory({ status: 'error', source: r.source, reason: t(r.reason) });
        else setHistory({ status: 'no-data', reason: r.status === 'no-data' ? r.reason : { code: 'fx.history.none' } });
      })
      .catch((e: unknown) => live && setHistory(errorOf(e, t('steps.crops.loadingSource'))));
    providers.context
      .getCrops(field.country)
      .then((list) => live && setCrops({ status: 'ready', data: list.filter((c) => c.kind !== 'cover') }))
      .catch((e: unknown) => live && setCrops(errorOf(e, t('steps.crops.cropsSource'))));
    return () => {
      live = false;
    };
  }, [field]);

  useEffect(() => load(), [load]);

  const saved = stored && stored.length > 0 ? <p role="status" className="text-base font-medium text-zinc-900">{stored.length === 1 ? t('steps.crops.saved.one') : t('steps.crops.saved', { n: stored.length })}</p> : null;

  if (history.status === 'loading') {
    return <StateBoundary state="loading" source={t('steps.crops.loadingSource')}>{null}</StateBoundary>;
  }

  if (history.status === 'ready') {
    return (
      <div className="grid gap-4">
        <Confirm
          proposed={history.data}
          stored={stored}
          crops={crops}
          onSave={(years) => setCropHistory(field.id, years)}
        />
        {saved}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {history.status === 'error' ? (
        <StateBoundary state="error" source={history.source} reason={history.reason} onRetry={load}>
          {null}
        </StateBoundary>
      ) : (
        <p className="rounded-lg bg-zinc-100 px-3 py-2 text-base text-zinc-800">{t(history.reason)}</p>
      )}
      <PickSeasons crops={crops} stored={stored} onRetry={load} onSave={(years) => setCropHistory(field.id, years)} />
      {saved}
    </div>
  );
}

function Confirm(props: {
  proposed: CropYear[];
  stored: CropYear[] | undefined;
  crops: Load<CropTraits[]>;
  onSave: (years: CropYear[]) => void;
}) {
  const { proposed, stored, crops, onSave } = props;
  const shown = stored && stored.length > 0 ? stored : proposed;
  const [editing, setEditing] = useState<number | null>(null);
  // A phone shows the three newest seasons (SPEC section 12); older ones stay one tap away and are still saved.
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? shown : shown.slice(-3);
  const hidden = shown.length - visible.length;

  const change = (year: number, crop: CropId) => {
    onSave(shown.map((y) => (y.year === year ? { year, crop, source: 'farmer' as const } : y)).sort(byYear));
  };

  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold text-zinc-900">{t('steps.crops.proposed')}</h2>
      <ul aria-label={t('steps.crops.listLabel')} className="grid gap-2">
        {[...visible].reverse().map((y) => (
          <li key={y.year} className="grid gap-2 rounded-2xl border-2 border-zinc-200 bg-white px-3 py-2">
            <div className="flex min-h-11 items-center gap-3">
              <span className="w-12 shrink-0 text-base font-semibold tabular-nums text-zinc-700">{y.year}</span>
              <span className="shrink-0 text-zinc-900">
                <CropIcon crop={y.crop} size={28} />
              </span>
              <span className="flex-1 text-base font-medium text-zinc-900">
                {cropName(y.crop)}
                {y.source === 'farmer' ? (
                  <span className="ml-2 rounded-full bg-lime-300 px-2 py-0.5 text-sm text-zinc-950">
                    {t('steps.crops.byFarmer')}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                aria-label={t('steps.crops.change', { year: y.year })}
                aria-expanded={editing === y.year}
                onClick={() => setEditing(editing === y.year ? null : y.year)}
                className="min-h-11 cursor-pointer rounded-lg border border-zinc-400 px-3 text-base text-zinc-800 hover:bg-zinc-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/40"
              >
                {editing === y.year ? t('steps.crops.done') : t('steps.crops.changeShort')}
              </button>
            </div>
            {editing === y.year ? (
              <CropsBoundary crops={crops}>
                {(list) => <CropPicker year={y.year} crops={list} value={y.crop} onPick={(crop) => change(y.year, crop)} />}
              </CropsBoundary>
            ) : null}
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="min-h-11 w-fit cursor-pointer rounded-lg px-2 text-base font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/40"
        >
          {t('steps.crops.showEarlier', { n: hidden })}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onSave(shown)}
        className="min-h-12 cursor-pointer rounded-2xl bg-zinc-900 px-4 text-lg font-semibold text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/40"
      >
        {t('steps.crops.confirm')}
      </button>
    </section>
  );
}

function PickSeasons(props: {
  crops: Load<CropTraits[]>;
  stored: CropYear[] | undefined;
  onRetry: () => void;
  onSave: (years: CropYear[]) => void;
}) {
  const { crops, stored, onRetry, onSave } = props;
  const seasons = lastSeasons();
  const picked = new Map((stored ?? []).map((y) => [y.year, y]));

  const pick = (year: number, crop: CropId) => {
    const next = new Map(picked);
    next.set(year, { year, crop, source: 'farmer' });
    onSave([...next.values()].sort(byYear));
  };

  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold text-zinc-900">{t('steps.crops.pickTitle')}</h2>
      <p className="text-base text-zinc-700">{t('steps.crops.pickHint')}</p>
      <CropsBoundary crops={crops} onRetry={onRetry}>
        {(list) => (
          <div className="grid gap-5">
            {seasons.map((year) => (
              <div key={year} className="grid gap-2">
                <p className="text-base font-semibold tabular-nums text-zinc-800">{year}</p>
                <CropPicker year={year} crops={list} value={picked.get(year)?.crop} onPick={(crop) => pick(year, crop)} />
              </div>
            ))}
          </div>
        )}
      </CropsBoundary>
      {picked.size < 2 ? <p className="rounded-md bg-amber-50 px-3 py-2 text-base text-amber-900">{t('steps.crops.needTwo')}</p> : null}
    </section>
  );
}

function CropsBoundary(props: {
  crops: Load<CropTraits[]>;
  onRetry?: () => void;
  children: (list: CropTraits[]) => React.ReactNode;
}) {
  const { crops, onRetry, children } = props;
  if (crops.status === 'ready' && crops.data.length > 0) return <>{children(crops.data)}</>;
  if (crops.status === 'loading') return <StateBoundary state="loading" source={t('steps.crops.cropsSource')}>{null}</StateBoundary>;
  if (crops.status === 'error') {
    return (
      <StateBoundary state="error" source={crops.source} reason={crops.reason} onRetry={onRetry}>
        {null}
      </StateBoundary>
    );
  }
  return (
    <StateBoundary state="no-data" reason={t('steps.crops.otherCountry')}>
      {null}
    </StateBoundary>
  );
}
