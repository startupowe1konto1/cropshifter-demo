// Step 6: what each rotation from step 5 would have earned on this field (SPEC section 12, plan
// docs/superpowers/plans/2026-11-14-step-6-money.md). Same rotations as the cards: the farmer's rotation first as the
// reference, each option as its difference from it, then a disclosure per rotation with the bad, average and good year,
// the payments and the campaign dates. Data text (sources, programmes, campaign) is shown in Polish under Polish.
// Income is a replay of past years at today's prices, never a forecast.
import { Fragment, useEffect, type ReactNode } from "react";
import { t, useLang } from "../../app/i18n";
import { useAppStore } from "../../app/store";
import { useOnline } from "../../app/useOnline";
import type { Dataset, Sourced } from "../../contracts";
import { SourcedNumber, SourcesNote, StateBoundary } from "../../ui-kit";
import { Margins, Payments } from "../cards/IncomeSection";
import { TermText } from "../cards/TermText";
import { MarginChart } from "./MarginChart";
import {
  compareRows,
  moneyRows,
  rankingGoal,
  type MoneyRow,
} from "./moneyRows";
import { localizeDatasets, localizeMoney } from "./plText";
import { SwitchOrStay } from "./SwitchOrStay";

/** A message template with React elements in place of its {placeholders}, as TermText does for glossary terms. */
function Template({
  code,
  parts,
}: {
  code: string;
  parts: Record<string, ReactNode>;
}) {
  const pieces = t(code).split(/\{(\w+)\}/);
  return (
    <>
      {pieces.map((piece, i) => (
        <Fragment key={i}>
          {i % 2 === 0 ? piece : (parts[piece] ?? `{${piece}}`)}
        </Fragment>
      ))}
    </>
  );
}

/** The best option against the current rotation, in an average year. Unconfirmed payments are never part of it. */
function Headline({
  rows,
  datasets,
}: {
  rows: MoneyRow[];
  datasets: Dataset[];
}) {
  const current = rows.find((r) => r.isCurrent && r.status === "ready");
  const options = rows.filter((r) => !r.isCurrent && r.status === "ready");
  if (!current || options.length === 0) return null;
  const best = options.reduce((a, b) => (b.mean! > a.mean! ? b : a));
  if (best.mean! <= current.mean!) {
    return (
      <p className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base leading-snug text-zinc-800">
        {t("steps.money.headlineNone")}
      </p>
    );
  }
  const diff: Sourced = {
    value: best.mean! - current.mean!,
    unit: current.margin!.unit,
    datasetIds: [
      ...new Set([...best.margin!.datasetIds, ...current.margin!.datasetIds]),
    ],
    kind: "derived",
    retrievedAt: best.margin!.retrievedAt,
  };
  return (
    <p
      data-testid="money-headline"
      className="rounded-2xl border border-lime-300 bg-lime-100 px-4 py-3 text-base leading-relaxed text-zinc-950"
    >
      <Template
        code="steps.money.headline"
        parts={{
          name: <strong className="font-semibold">{best.title}</strong>,
          diff: <SourcedNumber value={diff} datasets={datasets} decimals={0} />,
        }}
      />
    </p>
  );
}

function Details({ row, datasets }: { row: MoneyRow; datasets: Dataset[] }) {
  return (
    <details
      data-testid="money-details"
      className="group border-t border-zinc-200 first:border-t-0"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-900 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="grid">
          <span className="text-base font-medium text-zinc-900">
            {row.title}
            {row.isCurrent ? (
              <span className="ml-2 inline-block rounded-full bg-zinc-800 px-2 py-0.5 align-middle text-xs font-semibold uppercase tracking-wide text-white">
                {t("steps.money.current")}
              </span>
            ) : null}
          </span>
          <span className="text-sm text-zinc-600">
            {t("steps.money.details")}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="text-zinc-500 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        >
          ▾
        </span>
      </summary>
      <div className="grid items-start gap-3 px-4 pb-4 sm:px-5 lg:grid-cols-2 lg:gap-6">
        {row.status === "ready" && row.money ? (
          <>
            <Margins m={row.money.marginPerHa} datasets={datasets} />
            <Payments money={row.money} datasets={datasets} />
          </>
        ) : (
          <StateBoundary
            state={row.status === "error" ? "error" : "no-data"}
            source={row.source}
            reason={
              row.status === "not-loaded"
                ? t("steps.rotations.income.notLoaded")
                : row.reason
                  ? t(row.reason)
                  : undefined
            }
          >
            {null}
          </StateBoundary>
        )}
      </div>
    </details>
  );
}

export function MoneyStep() {
  const analysis = useAppStore((s) => s.analysis);
  const goal = useAppStore((s) => s.goal);
  const runAnalysis = useAppStore((s) => s.runAnalysis);
  const online = useOnline();
  const lang = useLang((s) => s.lang);

  // The analysis needs NASA POWER, so it waits for a connection instead of starting a request that will fail.
  useEffect(() => {
    if (analysis.status === "idle" && online) void runAnalysis();
  }, [analysis.status, online, runAnalysis]);

  if (analysis.status !== "ready") {
    if (!online) return <StateBoundary state="offline">{null}</StateBoundary>;
    return (
      <StateBoundary
        state={analysis.status === "error" ? "error" : "loading"}
        source={
          analysis.status === "error"
            ? analysis.source
            : t("steps.rotations.analysis")
        }
        reason={analysis.status === "error" ? analysis.reason : undefined}
        onRetry={() => void runAnalysis()}
      >
        {null}
      </StateBoundary>
    );
  }

  const { data } = analysis;
  if (data.rotations.length === 0) {
    return (
      <StateBoundary state="no-data" reason={t("steps.rotations.noCrops")}>
        {null}
      </StateBoundary>
    );
  }

  const datasets = localizeDatasets(data.datasets, lang);
  const rows = moneyRows(data, goal).map((r) =>
    r.money ? { ...r, money: localizeMoney(r.money, lang) } : r,
  );
  // The disclosures follow the chart: the farmer's rotation first, then the options as the chart orders them.
  const { current, options } = compareRows(rows);
  const ordered = [...(current ? [current] : []), ...options];
  const anyReady = rows.some((r) => r.status === "ready");

  return (
    <div className="grid gap-5">
      <SwitchOrStay
        rows={rows}
        analysis={data}
        goal={rankingGoal(data, goal)}
      />
      <SourcesNote
        values={rows.flatMap((r) =>
          r.status === "ready"
            ? [r.margin!, ...r.money!.payments.map((p) => p.amountPerHa)]
            : [],
        )}
        datasets={datasets}
      />
      <p className="flex flex-wrap gap-x-1 text-sm text-zinc-700">
        <span className="font-medium text-zinc-800">
          {t("steps.rotations.income.notForecast")}
        </span>
        <span>{t("app.support")}</span>
      </p>

      <section
        aria-labelledby="money-title"
        className="grid gap-5 rounded-[20px] border border-zinc-200 bg-white p-4 sm:p-5"
      >
        <div className="grid gap-1.5">
          <h2 id="money-title" className="text-lg font-semibold text-zinc-900">
            {t("steps.money.title")}
          </h2>
          <p
            data-testid="money-intro"
            className="max-w-3xl text-sm leading-relaxed text-zinc-700"
          >
            <TermText code="steps.money.intro" terms={{ margin: "margin" }} />
          </p>
        </div>

        {anyReady ? (
          <Headline rows={rows} datasets={datasets} />
        ) : (
          <p
            role="status"
            className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-base text-amber-900"
          >
            {t("steps.money.noneReady")}
          </p>
        )}

        <MarginChart rows={rows} datasets={datasets} />
      </section>

      {/* Bad and good years, payments and sources per rotation stay one tap away. */}
      <details data-testid="money-more" className="group grid gap-5">
        <summary className="flex min-h-12 w-fit cursor-pointer list-none items-center gap-2 rounded-2xl border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-900 hover:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 [&::-webkit-details-marker]:hidden">
          {t("steps.money.moreDetails")}
          <span
            aria-hidden="true"
            className="text-zinc-500 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          >
            ▾
          </span>
        </summary>
        <div className="mt-5 grid gap-5">
          <section className="overflow-hidden rounded-[20px] border border-zinc-200 bg-white">
            {ordered.map((row) => (
              <Details key={row.id} row={row} datasets={datasets} />
            ))}
          </section>
        </div>
      </details>
    </div>
  );
}
