import { render, screen } from '@testing-library/react';
import type { Score } from '../contracts';
import { ScoreBar } from './ScoreBar';

const score: Score = { value: 62, low: 50, high: 71, confidence: 'moderate', basis: { code: 'engine.basis.years' } };

describe('ScoreBar', () => {
  it('shows the label, value, range and confidence', () => {
    render(<ScoreBar label="Soil health" score={score} />);
    expect(screen.getByText('Soil health')).toBeInTheDocument();
    expect(screen.getByText('62 / 100')).toBeInTheDocument();
    expect(screen.getByText('range 50–71')).toBeInTheDocument();
    expect(screen.getByText('Moderate evidence')).toBeInTheDocument();
  });

  it('describes the bar in words', () => {
    render(<ScoreBar label="Soil health" score={score} />);
    expect(screen.getByRole('img', { name: 'Soil health: 62 out of 100, range 50 to 71' })).toBeInTheDocument();
  });

  it('shows the basis text when given', () => {
    render(<ScoreBar label="Climate resilience" score={score} basisText="Spread across the 45 years of the record" />);
    expect(screen.getByText('Spread across the 45 years of the record')).toBeInTheDocument();
  });

  it('rounds the numbers and keeps the marker inside the bar', () => {
    const odd: Score = { value: 104.6, low: -3, high: 120, confidence: 'weak', basis: { code: 'engine.basis.rule' } };
    const { container } = render(<ScoreBar label="Erosion" score={odd} />);
    expect(screen.getByText('100 / 100')).toBeInTheDocument();
    expect(screen.getByText('range 0–100')).toBeInTheDocument();
    expect(screen.getByText('Weak evidence')).toBeInTheDocument();
    expect(container.querySelector<HTMLElement>('[data-part="marker"]')?.style.left).toBe('100%');
    expect(container.querySelector<HTMLElement>('[data-part="range"]')?.style.width).toBe('100%');
  });
});
