// The "Best for" badge (O1-F11): only the first suggested rotation carries it, never the farmer's own rotation.
import { render, screen } from '@testing-library/react';
import { t } from '../../app/i18n';
import { iowaAnalysis } from '../../fixtures';
import { RotationCard } from './RotationCard';

const datasets = iowaAnalysis.datasets;
const current = iowaAnalysis.rotations.find((r) => r.isCurrent)!;
const other = iowaAnalysis.rotations.find((r) => !r.isCurrent)!;
const badge = () => t('steps.rotations.bestFor', { goal: t('steps.goal.improveSoil') });

describe('RotationCard best-for badge', () => {
  it('shows the goal on the first suggested rotation', async () => {
    render(<RotationCard rotation={other} rank={1} goal="improveSoil" datasets={datasets} moneyAvailable={false} />);
    expect(await screen.findByText(badge())).toBeInTheDocument();
  });

  it('leaves it off the second rotation and off the current one', () => {
    const { unmount } = render(<RotationCard rotation={other} rank={2} goal="improveSoil" datasets={datasets} moneyAvailable={false} />);
    expect(screen.queryByText(badge())).not.toBeInTheDocument();
    unmount();
    render(<RotationCard rotation={current} rank={1} goal="improveSoil" datasets={datasets} moneyAvailable={false} />);
    expect(screen.queryByText(badge())).not.toBeInTheDocument();
  });
});
