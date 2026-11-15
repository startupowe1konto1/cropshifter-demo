// Month-by-month calendar of one rotation: cover state per month and hazard marks (SPEC section 8).
// O2-B3 places one strip on each card, the current rotation's strip above the others.
// No list elements inside: O1's e2e reads the card's lists by position (gaps, then risks).
import { useId, useState } from 'react';
import type { CalendarMonth, CropId, Dataset, Hazard, Sourced } from '../../contracts';
import { t } from '../../app/i18n';
import { SourcedNumber, StateBoundary } from '../../ui-kit';
import { cropName as sharedCropName } from '../shared/cropName';
import { COVER_CLASS, COVER_STATES, HAZARDS, HazardMark, MissingMark, isMarked, isMissing } from './marks';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const monthName = (month: number) => t(`calendar.month.${month}`);
const hazardName = (hazard: Hazard) => t(`calendar.hazard.${hazard}`);

/** Plain words for a list of hazards: "drought", "drought and heat", "drought, heat and frost". */
function hazardList(hazards: Hazard[]): string {
  const names = hazards.map((h) => hazardName(h).toLowerCase());
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ${t('calendar.and')} ${names[names.length - 1]}`;
}

interface CellHazards {
  marked: Hazard[];
  missing: Hazard[];
}

function cellLabel(month: number, cell: CalendarMonth | undefined, cropName: (id: CropId) => string, hazards?: CellHazards) {
  const parts = [monthName(month)];
  if (!cell) parts.push(t('calendar.cell.missing'));
  else if (cell.cover === 'crop') parts.push(cell.crop ? cropName(cell.crop) : t('calendar.cover.crop').toLowerCase());
  else if (cell.cover === 'cover-crop')
    parts.push(cell.crop ? t('calendar.cell.cover-cropNamed', { crop: cropName(cell.crop) }) : t('calendar.cell.cover-crop'));
  else parts.push(t(`calendar.cell.${cell.cover}`));
  if (hazards && hazards.marked.length > 0) parts.push(t('calendar.cell.risk', { hazards: hazardList(hazards.marked) }));
  if (hazards && hazards.missing.length > 0) parts.push(t('calendar.cell.missingShare', { hazards: hazardList(hazards.missing) }));
  return parts.join(', ');
}

/**
 * The share of years as a percentage. "11 of 45 years" needs a structured year count in the contract, which does not
 * exist yet. A missing share stays missing, so SourcedNumber shows its reason.
 */
function shareForDisplay(probability: Sourced): Sourced {
  const { value, range } = probability;
  if (typeof value !== 'number' || !Number.isFinite(value)) return probability;
  return {
    ...probability,
    value: Math.round(value * 100),
    unit: t('calendar.detail.percent'),
    range: range ? { ...range, low: Math.round(range.low * 100), high: Math.round(range.high * 100) } : undefined,
  };
}

function Marks(props: CellHazards) {
  return (
    <span aria-hidden="true" className="flex max-w-full flex-wrap items-center justify-center gap-px">
      {props.marked.map((hazard) => (
        <span key={hazard} className="inline-flex rounded-sm bg-white p-px">
          <HazardMark hazard={hazard} />
        </span>
      ))}
      {props.missing.length > 0 ? (
        <span className="inline-flex rounded-sm bg-white p-px">
          <MissingMark />
        </span>
      ) : null}
    </span>
  );
}

export interface CalendarStripProps {
  /** The calendar of ONE rotation (`RotationOption.calendar`). */
  months: CalendarMonth[];
  /** Datasets for the source chips, e.g. `analysis.datasets`. */
  datasets: Dataset[];
  /** Display name of a crop id. Defaults to the shared crop names of src/steps/shared. */
  cropName?: (id: CropId) => string;
  /** Names the rotation in the caption, e.g. "your rotation". The caption always says "Crop calendar". */
  label?: string;
}

export function CalendarStrip(props: CalendarStripProps) {
  const { months, datasets, cropName = sharedCropName, label } = props;
  const [selected, setSelected] = useState<{ yearIndex: number; month: number } | null>(null);
  const detailsId = useId();

  const years = [...new Set(months.map((m) => m.yearIndex))].sort((a, b) => a - b);
  const find = (yearIndex: number, month: number) => months.find((m) => m.yearIndex === yearIndex && m.month === month);
  const hazardsOf = (cell: CalendarMonth | undefined): CellHazards => ({
    marked: cell ? HAZARDS.filter((h) => cell.exposure.some((e) => e.hazard === h && isMarked(e.probability))) : [],
    missing: cell ? HAZARDS.filter((h) => cell.exposure.some((e) => e.hazard === h && isMissing(e.probability))) : [],
  });
  const hasDetails = (h: CellHazards) => h.marked.length > 0 || h.missing.length > 0;

  const selectedCell = selected ? find(selected.yearIndex, selected.month) : undefined;
  const selectedHazards = hazardsOf(selectedCell);
  const yearNumber = (yearIndex: number) => years.indexOf(yearIndex) + 1;

  return (
    <StateBoundary state={months.length === 0 ? 'no-data' : 'ready'} reason={t('calendar.empty')}>
      <div className="text-zinc-900 [print-color-adjust:exact]">
        <table className="w-full table-fixed border-separate border-spacing-0.5 text-xs">
          <caption className="mb-1 text-left text-sm font-semibold text-zinc-900">
            {label ? t('calendar.captionFor', { label }) : t('calendar.caption')}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-12 text-left font-normal text-zinc-700">
                <span className="sr-only">{t('calendar.yearHeader')}</span>
              </th>
              {MONTHS.map((month) => (
                <th key={month} scope="col" className="min-w-6 font-medium text-zinc-700">
                  <span aria-hidden="true">{t(`calendar.monthShort.${month}`)}</span>
                  <span className="sr-only">{monthName(month)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((yearIndex) => (
              <tr key={yearIndex}>
                <th scope="row" className="whitespace-nowrap pr-1 text-left font-medium text-zinc-700">
                  {t('calendar.year', { n: yearNumber(yearIndex) })}
                </th>
                {MONTHS.map((month) => {
                  const cell = find(yearIndex, month);
                  const hazards = hazardsOf(cell);
                  const text = cellLabel(month, cell, cropName, hazards);
                  const colour = cell ? COVER_CLASS[cell.cover] : 'border border-dashed border-zinc-500 bg-white';
                  const box = `flex h-10 min-w-6 w-full items-center justify-center rounded-sm ${colour}`;

                  // Screen readers often skip aria-label on a <td>, so the words sit in the cell as sr-only text.
                  if (!hasDetails(hazards)) {
                    return (
                      <td key={month} title={text} className="p-0">
                        <span className="sr-only">{text}</span>
                        <span aria-hidden="true" className={box} />
                      </td>
                    );
                  }
                  const isOpen = selected?.yearIndex === yearIndex && selected.month === month;
                  return (
                    <td key={month} className="p-0">
                      <button
                        type="button"
                        title={text}
                        aria-expanded={isOpen}
                        aria-controls={isOpen ? detailsId : undefined}
                        onClick={() => setSelected(isOpen ? null : { yearIndex, month })}
                        className={`${box} cursor-pointer outline-none ring-offset-1 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-zinc-900 motion-safe:transition ${isOpen ? 'ring-2 ring-zinc-900' : ''}`}
                      >
                        <span className="sr-only">{text}</span>
                        <Marks {...hazards} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {selected && selectedCell ? (
          <section
            id={detailsId}
            aria-label={t('calendar.detail.title', { month: monthName(selected.month), year: yearNumber(selected.yearIndex) })}
            className="mt-2 rounded-lg border border-zinc-300 bg-zinc-50 p-3 text-sm"
          >
            <p className="font-semibold text-zinc-900">{cellLabel(selected.month, selectedCell, cropName)}</p>
            <div className="mt-1 space-y-1">
              {selectedCell.exposure
                .filter((e) => selectedHazards.marked.includes(e.hazard) || selectedHazards.missing.includes(e.hazard))
                .map((e) => (
                  <div key={e.hazard} className="flex flex-wrap items-center gap-x-2">
                    {isMissing(e.probability) ? <MissingMark size={14} /> : <HazardMark hazard={e.hazard} size={14} />}
                    <span className="text-zinc-900">
                      {t('calendar.detail.hazard', { hazard: hazardName(e.hazard), month: monthName(selected.month) })}
                    </span>
                    <SourcedNumber value={shareForDisplay(e.probability)} datasets={datasets} decimals={0} />
                  </div>
                ))}
            </div>
          </section>
        ) : months.some((m) => hasDetails(hazardsOf(m))) ? (
          <p className="mt-1 text-xs text-zinc-700">{t('calendar.detail.hint')}</p>
        ) : null}

        <div role="group" aria-label={t('calendar.legend')} className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-700">
          {COVER_STATES.map((cover) => (
            <span key={cover} className="inline-flex items-center gap-1">
              <span aria-hidden="true" data-testid={`swatch-${cover}`} className={`inline-block h-3 w-4 rounded-sm ${COVER_CLASS[cover]}`} />
              {t(`calendar.cover.${cover}`)}
            </span>
          ))}
          {HAZARDS.map((hazard) => (
            <span key={hazard} className="inline-flex items-center gap-1">
              <HazardMark hazard={hazard} size={12} />
              {hazardName(hazard)}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <MissingMark size={12} />
            {t('calendar.legend.missing')}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-700">{t('calendar.note')}</p>
      </div>
    </StateBoundary>
  );
}
