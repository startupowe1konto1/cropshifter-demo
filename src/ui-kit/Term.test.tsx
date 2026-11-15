import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLang } from '../app/i18n';
import { Term } from './Term';

const explanation = 'Water that leaves the field through the soil surface and the plants.';

describe('Term', () => {
  it('names its button in Polish when the language is Polish', () => {
    act(() => setLang('pl'));
    try {
      render(<Term label="ewapotranspiracja" explanation="Woda, która paruje z pola." />);
      expect(screen.getByRole('button', { name: 'Co znaczy „ewapotranspiracja”?' })).toBeInTheDocument();
    } finally {
      act(() => setLang('en'));
    }
  });

  it('shows the label and keeps the explanation hidden at first', () => {
    render(<Term label="evapotranspiration" explanation={explanation} />);
    expect(screen.getByText('evapotranspiration')).toBeInTheDocument();
    expect(screen.queryByText(explanation)).not.toBeInTheDocument();
  });

  it('shows the explanation on click and hides it on a second click', async () => {
    const user = userEvent.setup();
    render(<Term label="evapotranspiration" explanation={explanation} />);
    const button = screen.getByRole('button', { name: 'What does evapotranspiration mean?' });

    await user.click(button);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(explanation);
    expect(button).toHaveAttribute('aria-describedby', tooltip.id);

    await user.click(button);
    expect(screen.queryByText(explanation)).not.toBeInTheDocument();
  });

  it('shows the explanation on keyboard focus and hides it on Escape', async () => {
    const user = userEvent.setup();
    render(<Term label="evapotranspiration" explanation={explanation} />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'What does evapotranspiration mean?' })).toHaveFocus();
    expect(await screen.findByText(explanation)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByText(explanation)).not.toBeInTheDocument();
  });

  it('hides the explanation when focus leaves', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Term label="root zone" explanation="The soil layer the roots reach." />
        <button type="button">Next</button>
      </>,
    );
    await user.tab();
    expect(await screen.findByText('The soil layer the roots reach.')).toBeInTheDocument();
    await user.tab();
    expect(screen.queryByText('The soil layer the roots reach.')).not.toBeInTheDocument();
  });
});
