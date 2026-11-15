// Step 4: what else matters on this field, and crops the farmer will not grow (SPEC section 12).
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { t } from '../../app/i18n';
import { providers } from '../../app/providers';
import { selectedField, useAppStore } from '../../app/store';
import type { CropId, CropTraits, PriorityId } from '../../contracts';
import { SourceError } from '../../contracts';
import { StateBoundary } from '../../ui-kit';
import { IconCheck, IconErosion, IconForage, IconNitrogen, IconOrganicMatter, IconWater } from '../icons';
import { cropName } from '../shared/cropName';

const switches: { id: PriorityId; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'water', Icon: IconWater },
  { id: 'forage', Icon: IconForage },
  { id: 'nitrogen', Icon: IconNitrogen },
  { id: 'erosion', Icon: IconErosion },
  { id: 'organicMatter', Icon: IconOrganicMatter },
];

type CropsState =
  | { status: 'no-field' }
  | { status: 'loading' }
  | { status: 'ready'; crops: CropTraits[] }
  | { status: 'error'; source: string; reason: string };

export function PrioritiesStep() {
  const priorities = useAppStore((s) => s.priorities);
  const setPriorities = useAppStore((s) => s.setPriorities);
  const field = useAppStore(selectedField);

  const toggle = (id: PriorityId) =>
    setPriorities({
      ...priorities,
      on: priorities.on.includes(id) ? priorities.on.filter((p) => p !== id) : [...priorities.on, id],
    });

  const toggleCrop = (id: CropId) =>
    setPriorities({
      ...priorities,
      excludedCrops: priorities.excludedCrops.includes(id)
        ? priorities.excludedCrops.filter((c) => c !== id)
        : [...priorities.excludedCrops, id],
    });

  return (
    <div className="grid gap-6">
      {/* A plain-block fieldset with the grid inside: Safari shrinks the legend of a grid fieldset to one word per line. */}
      <fieldset className="min-w-0">
        <legend className="mb-4 text-lg font-semibold text-zinc-900">{t('steps.priorities.intro')}</legend>
        <div className="grid gap-3">
          <p className="text-base text-zinc-700">{t('steps.priorities.soilAlways')}</p>
          {switches.map(({ id, Icon }) => {
            const on = priorities.on.includes(id);
            const hintId = `priority-${id}-hint`;
            const titleId = `priority-${id}-title`;
            return (
              // Title and switch share the top row; the hint runs under them across the card on a phone, so it is not
              // squeezed into a narrow column between the icon and the switch.
              <label
                key={id}
                className={`relative grid min-h-[64px] cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 rounded-2xl border-2 px-4 py-3 transition-colors duration-150 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-zinc-900/40 ${
                  on ? 'border-zinc-900 bg-lime-100' : 'border-zinc-300 bg-white hover:border-zinc-500'
                }`}
              >
                <span className={`col-start-1 row-start-1 ${on ? 'text-zinc-900' : 'text-zinc-700'}`}>
                  <Icon size={28} />
                </span>
                <span id={titleId} className="col-start-2 row-start-1 min-w-0 text-lg font-semibold leading-snug text-zinc-900">
                  {t(`steps.priorities.${id}`)}
                </span>
                <span
                  id={hintId}
                  className="col-span-3 row-start-2 text-base leading-snug text-zinc-700 sm:col-span-1 sm:col-start-2"
                >
                  {t(`steps.priorities.${id}.hint`)}
                </span>
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={on}
                  aria-labelledby={titleId}
                  aria-describedby={hintId}
                  onChange={() => toggle(id)}
                />
                <span
                  aria-hidden="true"
                  className={`relative col-start-3 row-start-1 h-8 w-14 shrink-0 rounded-full transition-colors duration-150 ${on ? 'bg-zinc-900' : 'bg-zinc-400'}`}
                >
                  <span
                    className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform duration-150 motion-reduce:transition-none ${
                      on ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <ExcludedCrops
        country={field?.country}
        hasField={field !== undefined}
        excluded={priorities.excludedCrops}
        onToggle={toggleCrop}
      />
    </div>
  );
}

function ExcludedCrops(props: {
  country: 'US' | 'PL' | 'OTHER' | undefined;
  hasField: boolean;
  excluded: CropId[];
  onToggle: (id: CropId) => void;
}) {
  const { country, hasField, excluded, onToggle } = props;
  const [state, setState] = useState<CropsState>({ status: hasField ? 'loading' : 'no-field' });
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  // Every request gets a number; only the newest one may write the state, so a late answer to an older request
  // (a retry, or the field changing) never replaces a newer list.
  const latest = useRef(0);

  const load = useCallback(() => {
    const request = ++latest.current;
    if (!hasField || !country) {
      setState({ status: 'no-field' });
      return;
    }
    setState({ status: 'loading' });
    providers.context
      .getCrops(country)
      .then((crops) => {
        if (request !== latest.current) return;
        setState({ status: 'ready', crops });
        // Exclusions picked for a field in the other country do not apply here.
        const { priorities, setPriorities } = useAppStore.getState();
        const kept = priorities.excludedCrops.filter((id) => crops.some((c) => c.id === id));
        if (kept.length !== priorities.excludedCrops.length) setPriorities({ ...priorities, excludedCrops: kept });
      })
      .catch((error: unknown) => {
        if (request !== latest.current) return;
        const source = error instanceof SourceError ? error.source : t('steps.priorities.exclude.source');
        setState({ status: 'error', source, reason: error instanceof Error ? error.message : String(error) });
      });
  }, [country, hasField]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const boundary =
    state.status === 'loading' && !online
      ? 'offline'
      : state.status === 'loading'
        ? 'loading'
        : state.status === 'error'
          ? 'error'
          : state.status === 'no-field' || state.crops.length === 0
            ? 'no-data'
            : 'ready';

  const reason =
    state.status === 'no-field'
      ? t('steps.priorities.exclude.noField')
      : state.status === 'ready' && state.crops.length === 0
        ? t('steps.priorities.exclude.otherCountry')
        : state.status === 'error'
          ? state.reason
          : undefined;

  return (
    <fieldset className="min-w-0">
      <legend className="mb-4 text-lg font-semibold text-zinc-900">
        {t('steps.priorities.exclude.title')}
        {excluded.length > 0 ? (
          <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-sm font-medium text-zinc-800">
            {t('steps.priorities.exclude.count', { n: excluded.length })}
          </span>
        ) : null}
      </legend>
      <div className="grid gap-3">
        <p className="text-base text-zinc-700">{t('steps.priorities.exclude.hint')}</p>
        <StateBoundary
          state={boundary}
          source={state.status === 'error' ? state.source : t('steps.priorities.exclude.source')}
          reason={reason}
          onRetry={load}
        >
          {state.status === 'ready' ? (
            <ul className="grid grid-cols-2 gap-2">
              {state.crops.map((crop) => {
                const out = excluded.includes(crop.id);
                return (
                  <li key={crop.id}>
                    <label
                      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-2 transition-colors duration-150 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-zinc-900/40 ${
                        out ? 'border-zinc-700 bg-zinc-100 text-zinc-600' : 'border-zinc-300 bg-white text-zinc-900 hover:border-zinc-500'
                      }`}
                    >
                      <input type="checkbox" className="sr-only" checked={out} onChange={() => onToggle(crop.id)} />
                      <span
                        aria-hidden="true"
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 ${
                          out ? 'border-zinc-700 bg-zinc-700 text-white' : 'border-zinc-500 bg-white'
                        }`}
                      >
                        {out ? <IconCheck size={16} strokeWidth={3} /> : null}
                      </span>
                      <span className={`min-w-0 break-words text-base font-medium leading-snug ${out ? 'line-through' : ''}`}>
                        {cropName(crop.id)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </StateBoundary>
      </div>
    </fieldset>
  );
}
