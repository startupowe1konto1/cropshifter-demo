// Checks every data file the app ships: rules, crop traits and money rows need a source; precomputed and
// twins files need a meta block. Run with `npm run validate:data`. CI fails on the first problem it prints.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { cropTraits, meta, moneyFile, ruleRow } from '../src/contracts/schemas';

const checks: { dir: string; schema: z.ZodTypeAny }[] = [
  { dir: 'data/rules', schema: z.array(ruleRow) },
  { dir: 'data/crops', schema: z.array(cropTraits) },
  { dir: 'data/money', schema: moneyFile },
  { dir: 'data/precomputed', schema: z.looseObject({ meta }) },
  { dir: 'data/twins', schema: z.looseObject({ meta }) },
];

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return jsonFiles(path);
    return entry.name.endsWith('.json') ? [path] : [];
  });
}

/** Returns one line per problem; an empty array means every file is valid. Missing folders are fine. */
export function validateDataDir(root: string): string[] {
  const problems: string[] = [];
  for (const { dir, schema } of checks) {
    for (const file of jsonFiles(join(root, dir))) {
      const name = relative(root, file).replaceAll('\\', '/');
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(file, 'utf8'));
      } catch (error) {
        problems.push(`${name}: not valid JSON (${error instanceof Error ? error.message : String(error)})`);
        continue;
      }
      const result = schema.safeParse(parsed);
      if (!result.success) {
        for (const issue of result.error.issues.slice(0, 5)) {
          problems.push(`${name}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
        }
      }
    }
  }
  return problems;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const problems = validateDataDir(process.cwd());
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    console.error(`\n${problems.length} problem(s). Every rule, crop trait and money row needs a source; see docs/PLAN.md "Global constraints".`);
    process.exit(1);
  }
  console.log('Data files are valid.');
}
