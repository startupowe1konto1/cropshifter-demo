// Step 5: the field summary, then the current rotation and the three best others ranked on the goal from step 2 as
// small tiles; the picked one opens as a full card below, one card at a time. The sources are folded at the end. The
// goal is changed on its own step, not here (HANDOFF-frontend step 5).
import { useEffect, useState } from 'react';
import { t } from '../../app/i18n';
import { liveSoilData } from '../../app/providers';
import { useAppStore } from '../../app/store';
import { StateBoundary } from '../../ui-kit';
import { CalendarStrip } from '../calendar/CalendarStrip';
import { FieldSummary } from './FieldSummary';
import { OptionPicker } from './OptionPicker';
import { RotationCard } from './RotationCard';
import { SourcesPanel } from './SourcesPanel';
import { TermText } from './TermText';

export function RotationsStep() {
  const analysis = useAppStore((s) => s.analysis);
  const goal = useAppStore((s) => s.goal);
  const runAnalysis = useAppStore((s) => s.runAnalysis);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (analysis.status === 'idle') void runAnalysis();
  }, [analysis.status, runAnalysis]);

  if (analysis.status !== 'ready') {
    return (
      <>
        <StateBoundary
          state={analysis.status === 'error' ? 'error' : 'loading'}
          source={analysis.status === 'error' ? analysis.source : t('steps.rotations.analysis')}
          reason={analysis.status === 'error' ? analysis.reason : undefined}
          onRetry={() => void runAnalysis()}
        >
          {null}
        </StateBoundary>
        {analysis.status === 'loading' && liveSoilData ? (
          <p className="mt-2 text-base text-zinc-700">{t('steps.rotations.loadingNote')}</p>
        ) : null}
      </>
    );
  }

  const { data } = analysis;
  const ranking = data.shownByGoal[goal] ? goal : 'keepSoil';
  const ids = data.shownByGoal[ranking] ?? [];
  const rotations = ids.flatMap((id) => data.rotations.filter((r) => r.id === id));
  // "Option n" counts only the other rotations, so the labels read 1, 2, 3 whatever place the current one takes.
  const others = rotations.filter((r) => !r.isCurrent).map((r) => r.id);
  // The best other rotation opens first; the farmer's own rotation is one tap away for the comparison.
  const shown = rotations.find((r) => r.id === picked) ?? rotations.find((r) => !r.isCurrent) ?? rotations[0];

  return (
    <div className="grid gap-5">
      <FieldSummary analysis={data} />

      {data.rotations.length === 0 ? (
        <StateBoundary state="no-data" reason={t('steps.rotations.noCrops')}>
          {null}
        </StateBoundary>
      ) : (
        <>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="text-base text-zinc-700">{t('steps.rotations.intro')}</p>
              {/* Said once for all cards: how the ranges under the scores are made. */}
              <details className="group rounded-lg border border-zinc-200 bg-white px-3 sm:max-w-md">
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
                  {t('steps.rotations.rangeNoteTitle')}
                  <span aria-hidden="true" className="text-zinc-600 transition-transform group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <p className="pb-3 text-sm leading-relaxed text-zinc-700">
                  <TermText code="steps.rotations.rangeNote" terms={{ range: 'percentile-range' }} />
                </p>
              </details>
            </div>
            {ranking !== goal ? (
              <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-base text-amber-900">
                {t('steps.rotations.goalNoData')}
              </p>
            ) : null}
          </div>
          <OptionPicker rotations={rotations} numberOf={(id) => others.indexOf(id) + 1} selectedId={shown?.id ?? ''} onSelect={setPicked} />
          {shown ? (
            <RotationCard
              key={shown.id}
              rotation={shown}
              goal={ranking}
              rank={others.indexOf(shown.id) + 1}
              datasets={data.datasets}
              calendar={<CalendarStrip months={shown.calendar} datasets={data.datasets} />}
            />
          ) : null}
        </>
      )}

      <SourcesPanel datasets={data.datasets} />
    </div>
  );
}
