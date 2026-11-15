import { t } from '../app/i18n';

type State = 'loading' | 'offline' | 'no-data' | 'error' | 'ready';

const BOX = 'rounded-lg border p-4 text-base';

export function StateBoundary(props: {
  state: State;
  source?: string;
  reason?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  const { state, source, reason, onRetry, children } = props;

  if (state === 'ready') return <>{children}</>;

  if (state === 'loading') {
    return (
      <div role="status" className={`${BOX} border-zinc-200 bg-white`}>
        <p className="text-zinc-700">{source ? t('ui.state.loading', { source }) : t('ui.state.loadingGeneric')}</p>
        <div aria-hidden="true" className="mt-3 space-y-2 motion-safe:animate-pulse">
          <div className="h-4 w-3/4 rounded bg-zinc-200" />
          <div className="h-4 w-1/2 rounded bg-zinc-200" />
          <div className="h-10 w-full rounded bg-zinc-200" />
        </div>
      </div>
    );
  }

  if (state === 'offline') {
    return (
      <div role="status" className={`${BOX} border-zinc-400 bg-zinc-50`}>
        <p className="font-semibold text-zinc-900">{t('ui.state.offline.title')}</p>
        <p className="mt-1 text-zinc-700">{t('ui.state.offline.body')}</p>
      </div>
    );
  }

  if (state === 'no-data') {
    return (
      <div className={`${BOX} border-dashed border-zinc-400 bg-zinc-50`}>
        <p className="font-semibold text-zinc-900">{t('ui.noData')}</p>
        <p className="mt-1 text-zinc-700">{reason || t('ui.noReason')}</p>
      </div>
    );
  }

  return (
    <div role="alert" className={`${BOX} border-2 border-amber-700 bg-amber-50`}>
      <p className="font-semibold text-amber-950">
        {source ? t('ui.state.error', { source }) : t('ui.state.errorGeneric')}
      </p>
      {reason ? <p className="mt-1 text-amber-950">{reason}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex min-h-[44px] items-center rounded-lg bg-zinc-900 px-4 text-base font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 active:bg-zinc-800"
        >
          {t('ui.state.retry')}
        </button>
      ) : null}
    </div>
  );
}
