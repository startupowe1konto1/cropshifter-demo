import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLang } from '../../app/i18n';
import terms from './terms.en.json';
import plTerms from './terms.pl.json';
import { GlossaryPage } from './GlossaryPage';

describe('GlossaryPage', () => {
  it('lists every term alphabetically with its sentence under the heading', async () => {
    render(<GlossaryPage />);
    expect(await screen.findByRole('heading', { name: 'Words used in this tool' })).toBeInTheDocument();
    expect(await screen.findByText(terms['soil-wetness-index'].explanation)).toBeInTheDocument();

    // A plain <dl>: each dt keeps its term role and each dd its definition role.
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    const page = screen.getByRole('region', { name: 'Words used in this tool' });
    expect(within(page).getAllByRole('definition')).toHaveLength(Object.keys(terms).length);
    const labels = within(page)
      .getAllByRole('term')
      .map((el) => el.textContent ?? '');
    expect(labels).toHaveLength(Object.keys(terms).length);
    const sorted = [...labels].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    expect(labels).toEqual(sorted);
  });

  it('offers a way back to the step and moves focus to the heading', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<GlossaryPage backToStep={3} onBack={onBack} />);

    expect(await screen.findByRole('heading', { name: 'Words used in this tool' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Back to step 3' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('names the start page, not "step 0", when opened from it', async () => {
    render(<GlossaryPage backToStep={0} onBack={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Back to the start' })).toBeInTheDocument();
  });

  it('has no back button when nothing to go back to', async () => {
    render(<GlossaryPage />);
    await screen.findByText('Words used in this tool');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  describe('in Polish', () => {
    afterEach(() => act(() => setLang('en')));

    it('lists the Polish terms in Polish alphabetical order', async () => {
      act(() => setLang('pl'));
      render(<GlossaryPage />);
      const page = await screen.findByRole('region', { name: 'Pojęcia używane w tym narzędziu' });
      expect(await within(page).findByText(plTerms['root-zone'].explanation)).toBeInTheDocument();
      const labels = within(page)
        .getAllByRole('term')
        .map((el) => el.textContent ?? '');
      expect(labels).toEqual(expect.arrayContaining([plTerms['root-zone'].label, plTerms.evapotranspiration.label]));
      expect(labels).not.toContain(terms['root-zone'].label);
      const sorted = [...labels].sort((a, b) => a.localeCompare(b, 'pl', { sensitivity: 'base' }));
      expect(labels).toEqual(sorted);
    });

    it('switches to English when the language changes, without a reload', async () => {
      act(() => setLang('pl'));
      render(<GlossaryPage />);
      await screen.findByText(plTerms.anomaly.explanation);
      act(() => setLang('en'));
      expect(await screen.findByText(terms.anomaly.explanation)).toBeInTheDocument();
      expect(screen.queryByText(plTerms.anomaly.explanation)).not.toBeInTheDocument();
    });
  });
});
