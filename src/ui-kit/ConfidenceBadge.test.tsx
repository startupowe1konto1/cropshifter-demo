import { render, screen } from '@testing-library/react';
import { ConfidenceBadge } from './ConfidenceBadge';

describe('ConfidenceBadge', () => {
  it.each([
    ['strong', 'Strong evidence'],
    ['moderate', 'Moderate evidence'],
    ['weak', 'Weak evidence'],
  ] as const)('labels %s confidence as "%s"', (confidence, label) => {
    render(<ConfidenceBadge confidence={confidence} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('marks the level with an icon as well as colour', () => {
    const { container } = render(<ConfidenceBadge confidence="weak" />);
    expect(container.querySelector('[data-confidence="weak"]')).not.toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
