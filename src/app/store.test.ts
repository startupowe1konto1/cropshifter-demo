import { beforeEach, describe, expect, it } from 'vitest';
import { demoFields } from '../fixtures';
import { FIELD_HISTORY_MAX, STEP_COUNT, STEP_KEYS, asOneEdit, canContinue, useAppStore } from './store';

const field = demoFields.iowa;
const year = (y: number) => ({ year: y, crop: 'maize' as const, source: 'farmer' as const });

describe('step order (HANDOFF-frontend.md v2.1: start page, field before goal, no report)', () => {
  beforeEach(() => useAppStore.getState().reset());

  it('lists the six steps by key, field first', () => {
    expect(STEP_KEYS).toEqual(['field', 'goal', 'crops', 'priorities', 'rotations', 'money']);
    expect(STEP_COUNT).toBe(6);
  });

  it('opens on step 0, the start page', () => {
    expect(useAppStore.getState().step).toBe(0);
  });

  it('keeps goToStep between the start page and the last step', () => {
    useAppStore.getState().goToStep(-1);
    expect(useAppStore.getState().step).toBe(0);
    useAppStore.getState().goToStep(99);
    expect(useAppStore.getState().step).toBe(STEP_COUNT);
  });

  it('lets the farmer leave the field step only with a field', () => {
    const s = useAppStore.getState();
    s.goToStep(1);
    expect(canContinue(useAppStore.getState())).toBe(false);
    s.addField(field);
    expect(canContinue(useAppStore.getState())).toBe(true);
  });

  it('lets the farmer leave the goal step with nothing else filled in', () => {
    useAppStore.getState().goToStep(2);
    expect(canContinue(useAppStore.getState())).toBe(true);
  });

  it('asks for two years of crops on the crops step', () => {
    const s = useAppStore.getState();
    s.addField(field);
    s.goToStep(3);
    s.setCropHistory(field.id, [year(2025)]);
    expect(canContinue(useAppStore.getState())).toBe(false);
    s.setCropHistory(field.id, [year(2025), year(2024)]);
    expect(canContinue(useAppStore.getState())).toBe(true);
  });

  it('has no next step after the last one', () => {
    useAppStore.getState().goToStep(STEP_COUNT);
    expect(canContinue(useAppStore.getState())).toBe(false);
  });
});

describe('undo for field edits (the user, Sat 14 Nov: undo adding, selecting, cutting and so on)', () => {
  const { iowa, poznan } = demoFields;
  const s = () => useAppStore.getState();
  const ids = () => s().fields.map((f) => f.id);

  beforeEach(() => s().reset());

  it('has nothing to undo at the start, and undo then changes nothing', () => {
    expect(s().fieldHistory).toHaveLength(0);
    s().undoFieldEdit();
    expect(s().fields).toEqual([]);
  });

  it('takes back an added field and the selection it made', () => {
    s().addField(iowa);
    s().addField(poznan);
    s().undoFieldEdit();
    expect(ids()).toEqual([iowa.id]);
    expect(s().selectedFieldId).toBe(iowa.id);
    s().undoFieldEdit();
    expect(ids()).toEqual([]);
    expect(s().selectedFieldId).toBeNull();
  });

  it('adds no undo step when the same field, already selected, is added again (a second search near Iowa)', () => {
    s().addField(iowa);
    s().addField(iowa);
    s().addField({ ...iowa }); // same field from a new answer
    expect(s().fieldHistory).toHaveLength(1);
    s().undoFieldEdit();
    expect(ids()).toEqual([]);
  });

  it('takes back a selection, but a tap on the field already selected is not a step', () => {
    s().addField(iowa);
    s().addField(poznan);
    s().selectField(poznan.id);
    expect(s().fieldHistory).toHaveLength(2);
    s().selectField(iowa.id);
    s().undoFieldEdit();
    expect(s().selectedFieldId).toBe(poznan.id);
  });

  it('brings back a removed field with its crop history', () => {
    s().addField(iowa);
    s().setCropHistory(iowa.id, [year(2025), year(2024)]);
    s().removeField(iowa.id);
    s().undoFieldEdit();
    expect(ids()).toEqual([iowa.id]);
    expect(s().cropHistory[iowa.id]).toHaveLength(2);
  });

  it('keeps crops entered after the change it takes back', () => {
    s().addField(iowa);
    s().addField(poznan);
    s().setCropHistory(iowa.id, [year(2025), year(2024)]);
    s().undoFieldEdit(); // takes back Poznań only
    expect(s().cropHistory[iowa.id]).toHaveLength(2);
  });

  it('takes back a reshaped outline', () => {
    s().addField(iowa);
    s().updateField({ ...iowa, polygon: poznan.polygon, areaHa: poznan.areaHa });
    s().undoFieldEdit();
    expect(s().fields[0]).toEqual(iowa);
  });

  it('takes back an edit made of several store calls in one step (a cut, a join)', () => {
    s().addField(iowa);
    asOneEdit(() => {
      s().removeField(iowa.id);
      s().addField({ ...iowa, id: 'a' });
      s().addField({ ...iowa, id: 'b' });
    });
    expect(s().fieldHistory).toHaveLength(2);
    s().undoFieldEdit();
    expect(ids()).toEqual([iowa.id]);
  });

  it('keeps the last FIELD_HISTORY_MAX steps', () => {
    for (let i = 0; i < FIELD_HISTORY_MAX + 5; i++) s().addField({ ...iowa, id: `f${i}` });
    expect(s().fieldHistory).toHaveLength(FIELD_HISTORY_MAX);
  });

  it('forgets the history on reset', () => {
    s().addField(iowa);
    s().reset();
    expect(s().fieldHistory).toHaveLength(0);
  });
});
