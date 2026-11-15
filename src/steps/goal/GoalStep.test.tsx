import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAppStore } from '../../app/store';
import { GoalStep } from './GoalStep';

const money = vi.hoisted(() => ({ available: false }));
vi.mock('../../app/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/providers')>();
  return {
    ...actual,
    get moneyAvailable() {
      return money.available;
    },
  };
});

beforeEach(() => {
  useAppStore.getState().reset();
  money.available = false;
});

describe('GoalStep', () => {
  it('offers three goals and asks what matters most', async () => {
    render(<GoalStep />);
    expect(await screen.findByRole('radiogroup', { name: 'What matters most to you?' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Keep my soil/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Improve my soil/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Income/ })).toBeInTheDocument();
  });

  it('does not promise a goal switch on the rotations screen, which goes away (the user, Sat 14 Nov)', async () => {
    render(<GoalStep />);
    await screen.findByRole('radiogroup', { name: 'What matters most to you?' });
    expect(screen.queryByText(/rotations screen/)).not.toBeInTheDocument();
  });

  it('marks keeping the soil as chosen by default', () => {
    render(<GoalStep />);
    expect(screen.getByRole('radio', { name: /Keep my soil/ })).toBeChecked();
  });

  it.each([
    ['Keep my soil', 'keepSoil'],
    ['Improve my soil', 'improveSoil'],
    ['Income', 'income'],
  ] as const)('clicking "%s" stores the goal %s', async (label, goal) => {
    const user = userEvent.setup();
    useAppStore.setState({ goal: label === 'Keep my soil' ? 'income' : 'keepSoil' });
    render(<GoalStep />);
    await user.click(screen.getByRole('radio', { name: new RegExp(label) }));
    expect(useAppStore.getState().goal).toBe(goal);
    expect(screen.getByRole('radio', { name: new RegExp(label) })).toBeChecked();
  });

  it('says price data is not loaded yet on the income goal when money tables are missing', async () => {
    render(<GoalStep />);
    expect(await screen.findByText(/price data not loaded yet/i)).toBeInTheDocument();
  });

  it('drops the price note once money tables are wired', () => {
    money.available = true;
    render(<GoalStep />);
    expect(screen.queryByText(/price data not loaded yet/i)).not.toBeInTheDocument();
  });

  it('reads the price note once: inside the income option, not again as its description', () => {
    render(<GoalStep />);
    const income = screen.getByRole('radio', { name: /Income/ });
    expect(income).toHaveAccessibleName(/price data not loaded yet/i);
    expect(income).not.toHaveAttribute('aria-describedby');
  });
});
