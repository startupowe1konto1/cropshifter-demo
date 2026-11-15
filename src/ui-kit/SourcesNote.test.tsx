// D56: one line per section says what kind of numbers it holds and where they come from.
import { render, screen } from '@testing-library/react';
import type { Dataset, Sourced } from '../contracts';
import { SourcesNote } from './SourcesNote';

const set = (id: string, name: string): Dataset => ({
  id, name, provider: 'p', url: 'https://example.org', nasa: false, resolution: '1 km', period: '2020', kind: 'model',
} as Dataset);
const val = (kind: Sourced['kind'], ids: string[]): Sourced => ({ value: 1, datasetIds: ids, kind, retrievedAt: '2026-11-15' });

describe('SourcesNote', () => {
  it('names each kind once and every dataset', () => {
    const datasets = [set('a', 'NASA POWER monthly'), set('b', 'SoilGrids')];
    render(<SourcesNote values={[val('derived', ['a']), val('derived', ['a']), val('model', ['b'])]} datasets={datasets} />);
    const note = screen.getByTestId('sources-note');
    expect(note).toHaveTextContent('Numbers here: model estimate, our calculation, from NASA POWER monthly, SoilGrids.');
    expect(note.textContent!.match(/our calculation/g)).toHaveLength(1);
  });

  it('shows nothing when there are no values', () => {
    render(<SourcesNote values={[]} datasets={[]} />);
    expect(screen.queryByTestId('sources-note')).toBeNull();
  });
});
