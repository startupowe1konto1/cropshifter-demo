// Cut and join applied to the app's fields: the geometry in splitMerge.ts, plus what the store has to carry over.
import type { Position } from 'geojson';
import { asOneEdit, useAppStore } from '../../app/store';
import type { CropYear, Field } from '../../contracts';
import { mergeFields, splitField, type SplitFailure } from './splitMerge';

export type CutOutcome = { ok: true; fields: [Field, Field] } | { ok: false; reason: SplitFailure | 'no-field' };
export type JoinOutcome = { ok: true; field: Field } | { ok: false; reason: 'not-adjacent' | 'no-field' };

const sameHistory = (a: CropYear[], b: CropYear[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Cuts the field along the line through two [lon, lat] points. Both parts are the same land, so both keep its crop
 * history and the first one is selected. On a failed cut nothing changes.
 */
export function cutField(id: string, line: [Position, Position]): CutOutcome {
  const { fields, cropHistory, removeField, addField, setCropHistory, selectField } = useAppStore.getState();
  const field = fields.find((f) => f.id === id);
  if (!field) return { ok: false, reason: 'no-field' };
  const result = splitField(field, line, fields);
  if (!result.ok) return result;
  const [first, second] = result.fields;
  const history = cropHistory[id];
  asOneEdit(() => {
    removeField(id);
    addField(first);
    addField(second);
    selectField(first.id);
    if (history) {
      setCropHistory(first.id, history);
      setCropHistory(second.id, history);
    }
  });
  return result;
}

/**
 * Joins two fields that share a border into a new, selected one. Crop history carries over only when both fields had
 * the same history; otherwise the farmer enters it for the joined field. On a failed join nothing changes.
 */
export function joinFields(idA: string, idB: string): JoinOutcome {
  const { fields, cropHistory, removeField, addField, setCropHistory } = useAppStore.getState();
  const a = fields.find((f) => f.id === idA);
  const b = fields.find((f) => f.id === idB);
  if (!a || !b) return { ok: false, reason: 'no-field' };
  const joined = mergeFields(a, b, fields);
  if (!joined) return { ok: false, reason: 'not-adjacent' };
  const historyA = cropHistory[idA];
  const historyB = cropHistory[idB];
  asOneEdit(() => {
    removeField(idA);
    removeField(idB);
    addField(joined);
    if (historyA && historyB && sameHistory(historyA, historyB)) setCropHistory(joined.id, historyA);
  });
  return { ok: true, field: joined };
}
