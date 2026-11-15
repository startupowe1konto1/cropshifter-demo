// Registry of every dataset the app can show a source chip for.
// Each module that fetches or ships data exports `datasets: Dataset[]` from src/<module>/datasets.ts.
import type { Dataset } from '../contracts';
import { fixtureDatasets } from '../fixtures';

// Whole modules are imported, so a datasets.ts without a `datasets` export is skipped instead of breaking the build.
const modules = import.meta.glob<{ datasets?: Dataset[] }>(['../*/datasets.ts', '!../fixtures/datasets.ts'], { eager: true });

/** All known datasets, NASA first, without duplicates. Real modules come before fixtures, so their entry for an id wins. */
export const datasets: Dataset[] = [...Object.values(modules).flatMap((m) => m.datasets ?? []), ...fixtureDatasets]
  .filter((d, i, all) => all.findIndex((other) => other.id === d.id) === i)
  .sort((a, b) => Number(b.nasa) - Number(a.nasa));
