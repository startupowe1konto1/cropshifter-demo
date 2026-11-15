// Single app store. Steps read and write here; nothing else holds farmer input.
import { create } from 'zustand';
import type { Analysis, CropId, CropYear, Field, GoalId, PriorityId } from '../contracts';
import { SourceError } from '../contracts';
import { analyzeField, providers } from './providers';

/** The steps in order (HANDOFF-frontend.md v2.1). Step 0 is the start page and has no key. */
export const STEP_KEYS = ['field', 'goal', 'crops', 'priorities', 'rotations', 'money'] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export const STEP_COUNT = STEP_KEYS.length;

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: Analysis }
  | { status: 'error'; source: string; reason: string };

/** The fields as they were before one edit, for undo. */
export interface FieldSnapshot {
  fields: Field[];
  selectedFieldId: string | null;
  cropHistory: Record<string, CropYear[]>;
}
export const FIELD_HISTORY_MAX = 30;

export interface AppState {
  step: number; // 0 (start page) ..STEP_COUNT
  goal: GoalId;
  fields: Field[];
  selectedFieldId: string | null;
  cropHistory: Record<string, CropYear[]>; // by field id
  priorities: { on: PriorityId[]; excludedCrops: CropId[] };
  analysis: AnalysisState;
  /** Field edits that undo can take back, oldest first. */
  fieldHistory: FieldSnapshot[];

  goToStep(step: number): void;
  setGoal(goal: GoalId): void;
  addField(field: Field): void;
  updateField(field: Field): void;
  removeField(id: string): void;
  selectField(id: string): void;
  /** Takes back the last field edit (add, select, reshape, remove, cut, join). Crops entered since are kept. */
  undoFieldEdit(): void;
  setCropHistory(fieldId: string, history: CropYear[]): void;
  setPriorities(priorities: { on: PriorityId[]; excludedCrops: CropId[] }): void;
  runAnalysis(): Promise<void>;
  reset(): void;
}

const initial = {
  step: 0,
  goal: 'keepSoil' as GoalId,
  fields: [] as Field[],
  selectedFieldId: null as string | null,
  cropHistory: {} as Record<string, CropYear[]>,
  priorities: { on: [] as PriorityId[], excludedCrops: [] as CropId[] },
  analysis: { status: 'idle' } as AnalysisState,
  fieldHistory: [] as FieldSnapshot[],
};

// While asOneEdit runs, the store calls inside it do not each add an undo step.
let grouped = 0;

/** The history with the state before this edit added, unless an edit group already added it. */
function remember(s: AppState): Pick<AppState, 'fieldHistory'> | Record<string, never> {
  if (grouped > 0) return {};
  const snapshot: FieldSnapshot = { fields: s.fields, selectedFieldId: s.selectedFieldId, cropHistory: s.cropHistory };
  return { fieldHistory: [...s.fieldHistory, snapshot].slice(-FIELD_HISTORY_MAX) };
}

/** Runs several field edits (a cut, a join) so that one undo takes all of them back. */
export function asOneEdit(edit: () => void): void {
  useAppStore.setState((s) => remember(s));
  grouped++;
  try {
    edit();
  } finally {
    grouped--;
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  ...initial,

  goToStep: (step) => set({ step: Math.min(STEP_COUNT, Math.max(0, step)) }),
  // The goal only changes the ranking, and the analysis holds the ranking for every goal, so no re-run is needed.
  setGoal: (goal) => set({ goal }),

  addField: (field) =>
    set((s) => {
      // The same field, already selected (a second search near the Iowa demo field): nothing changes, so no undo
      // step and no new analysis.
      const existing = s.fields.find((f) => f.id === field.id);
      if (s.selectedFieldId === field.id && existing && JSON.stringify(existing) === JSON.stringify(field)) return {};
      return {
        ...remember(s),
        fields: [...s.fields.filter((f) => f.id !== field.id), field],
        selectedFieldId: field.id,
        analysis: { status: 'idle' },
      };
    }),
  updateField: (field) =>
    set((s) => ({
      ...remember(s),
      fields: s.fields.map((f) => (f.id === field.id ? field : f)),
      analysis: { status: 'idle' },
    })),
  removeField: (id) =>
    set((s) => {
      const fields = s.fields.filter((f) => f.id !== id);
      const { [id]: _removed, ...cropHistory } = s.cropHistory;
      return {
        ...remember(s),
        fields,
        cropHistory,
        selectedFieldId: s.selectedFieldId === id ? (fields[0]?.id ?? null) : s.selectedFieldId,
        analysis: { status: 'idle' },
      };
    }),
  // A tap on the field that is already selected changes nothing, so it is not an undo step.
  selectField: (id) =>
    set((s) => (s.selectedFieldId === id ? {} : { ...remember(s), selectedFieldId: id, analysis: { status: 'idle' } })),

  undoFieldEdit: () =>
    set((s) => {
      const last = s.fieldHistory[s.fieldHistory.length - 1];
      if (!last) return {};
      // Crops entered after the edit stay; a field that comes back brings its crops from before.
      const cropHistory: Record<string, CropYear[]> = {};
      for (const f of last.fields) {
        const history = s.cropHistory[f.id] ?? last.cropHistory[f.id];
        if (history) cropHistory[f.id] = history;
      }
      return {
        fields: last.fields,
        selectedFieldId: last.selectedFieldId,
        cropHistory,
        fieldHistory: s.fieldHistory.slice(0, -1),
        analysis: { status: 'idle' },
      };
    }),

  setCropHistory: (fieldId, history) =>
    set((s) => ({ cropHistory: { ...s.cropHistory, [fieldId]: history }, analysis: { status: 'idle' } })),
  setPriorities: (priorities) => set({ priorities, analysis: { status: 'idle' } }),

  runAnalysis: async () => {
    const { fields, selectedFieldId, cropHistory, priorities, goal } = get();
    const field = fields.find((f) => f.id === selectedFieldId);
    if (!field) {
      set({ analysis: { status: 'error', source: 'app', reason: 'No field is selected.' } });
      return;
    }
    set({ analysis: { status: 'loading' } });
    try {
      const data = await analyzeField(
        { field, cropHistory: cropHistory[field.id] ?? [], priorities: { goal, ...priorities } },
        providers,
      );
      // Ignore the answer if the farmer changed the input while it was running.
      if (get().analysis.status === 'loading' && get().selectedFieldId === field.id) {
        set({ analysis: { status: 'ready', data } });
      }
    } catch (error) {
      const source = error instanceof SourceError ? error.source : 'analysis';
      const reason = error instanceof Error ? error.message : String(error);
      set({ analysis: { status: 'error', source, reason } });
    }
  },

  reset: () => set({ ...initial }),
}));

export const selectedField = (s: AppState): Field | undefined => s.fields.find((f) => f.id === s.selectedFieldId);

/** Whether the farmer can leave the given step. Decided by step key, so the order can change without touching this. */
export function canContinue(s: AppState): boolean {
  const field = selectedField(s);
  const key: StepKey | undefined = STEP_KEYS[s.step - 1];
  if (key === 'field') return field !== undefined;
  if (key === 'crops') return field !== undefined && (s.cropHistory[field.id]?.length ?? 0) >= 2;
  return s.step < STEP_COUNT;
}
