import type { Position } from 'geojson';
import { useAppStore } from '../../app/store';
import type { CropYear, Field } from '../../contracts';
import { demoFields } from '../../fixtures';
import { cutField, joinFields } from './editFields';

const { poznan, iowa } = demoFields;
const history: CropYear[] = [
  { year: 2023, crop: 'winter-wheat', source: 'farmer' },
  { year: 2024, crop: 'winter-rapeseed', source: 'farmer' },
];
/** A horizontal line through the middle of a field. */
const through = (f: Field): [Position, Position] => [
  [f.centroid.lon - 1, f.centroid.lat],
  [f.centroid.lon + 1, f.centroid.lat],
];

beforeEach(() => {
  useAppStore.getState().reset();
  useAppStore.setState({ fields: [poznan, iowa], selectedFieldId: poznan.id, cropHistory: { [poznan.id]: history } });
});

describe('cutField', () => {
  it('replaces the field with two that keep its crop history, and selects the first', () => {
    const outcome = cutField(poznan.id, through(poznan));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { fields, cropHistory, selectedFieldId } = useAppStore.getState();
    const [a, b] = outcome.fields;
    expect(fields.map((f) => f.id).sort()).toEqual([iowa.id, a.id, b.id].sort());
    expect(cropHistory[poznan.id]).toBeUndefined();
    expect(cropHistory[a.id]).toEqual(history);
    expect(cropHistory[b.id]).toEqual(history);
    expect(selectedFieldId).toBe(a.id);
  });

  it('leaves everything as it was when the line misses the field', () => {
    const before = useAppStore.getState().fields;
    const outcome = cutField(poznan.id, [
      [poznan.centroid.lon + 5, poznan.centroid.lat],
      [poznan.centroid.lon + 5, poznan.centroid.lat + 1],
    ]);
    expect(outcome).toEqual({ ok: false, reason: 'no-crossing' });
    expect(useAppStore.getState().fields).toBe(before);
  });

  it('says so when the field is gone', () => {
    expect(cutField('missing', through(poznan))).toEqual({ ok: false, reason: 'no-field' });
  });
});

describe('joinFields', () => {
  /** Cut the Poznań field in two, to get two fields that share a border exactly. */
  const twoHalves = () => {
    const cut = cutField(poznan.id, through(poznan));
    if (!cut.ok) throw new Error('setup: the cut failed');
    return cut.fields;
  };

  it('puts a cut field back together: one field with the original area, selected', () => {
    const [a, b] = twoHalves();
    const outcome = joinFields(a.id, b.id);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { fields, selectedFieldId } = useAppStore.getState();
    expect(fields.map((f) => f.id).sort()).toEqual([iowa.id, outcome.field.id].sort());
    expect(Math.abs(outcome.field.areaHa - poznan.areaHa) / poznan.areaHa).toBeLessThan(0.01);
    expect(selectedFieldId).toBe(outcome.field.id);
  });

  it('keeps the crop history when both fields have the same one', () => {
    const [a, b] = twoHalves();
    const outcome = joinFields(a.id, b.id);
    if (!outcome.ok) throw new Error('join failed');
    expect(useAppStore.getState().cropHistory[outcome.field.id]).toEqual(history);
  });

  it('starts without crop history when the two fields had different ones', () => {
    const [a, b] = twoHalves();
    useAppStore.getState().setCropHistory(b.id, [{ year: 2024, crop: 'maize', source: 'farmer' }]);
    const outcome = joinFields(a.id, b.id);
    if (!outcome.ok) throw new Error('join failed');
    expect(useAppStore.getState().cropHistory[outcome.field.id]).toBeUndefined();
  });

  it('refuses fields that do not touch and changes nothing', () => {
    const before = useAppStore.getState().fields;
    expect(joinFields(poznan.id, iowa.id)).toEqual({ ok: false, reason: 'not-adjacent' });
    expect(useAppStore.getState().fields).toBe(before);
  });

  it('says so when a field is gone', () => {
    expect(joinFields(poznan.id, 'missing')).toEqual({ ok: false, reason: 'no-field' });
  });
});

describe('undo after a cut or a join', () => {
  const state = () => useAppStore.getState();

  it('takes a whole cut back in one undo, with the crop history', () => {
    const before = state().fields;
    cutField(poznan.id, through(poznan));
    state().undoFieldEdit();
    expect(state().fields).toEqual(before);
    expect(state().selectedFieldId).toBe(poznan.id);
    expect(state().cropHistory[poznan.id]).toEqual(history);
  });

  it('takes a whole join back in one undo', () => {
    const cut = cutField(poznan.id, through(poznan));
    if (!cut.ok) throw new Error('setup: the cut failed');
    const halves = state().fields;
    joinFields(cut.fields[0].id, cut.fields[1].id);
    state().undoFieldEdit();
    expect(state().fields).toEqual(halves);
  });

  it('adds no undo step when a cut fails', () => {
    const steps = state().fieldHistory.length;
    cutField(poznan.id, [
      [poznan.centroid.lon + 5, poznan.centroid.lat],
      [poznan.centroid.lon + 5, poznan.centroid.lat + 1],
    ]);
    expect(state().fieldHistory).toHaveLength(steps);
  });
});
