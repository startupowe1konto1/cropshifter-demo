import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJECT_NAME } from './brand';

// The name lives in brand.ts; the browser tab and the README must not drift from it (DECISIONS D13).
const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8'); // Vitest runs from the repo root

describe('project name', () => {
  it('is the name the team decided', () => {
    expect(PROJECT_NAME).toBe('CropShifter');
  });
  it('is the browser tab title', () => {
    expect(read('index.html')).toMatch(new RegExp(`<title>${PROJECT_NAME}</title>`));
  });
  it('is the first line of the README', () => {
    expect(read('README.md').split('\n')[0]).toBe(`# ${PROJECT_NAME}`);
  });
});
