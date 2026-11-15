import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

it('opens every new step at the top of the page', async () => {
  const scrollTo = vi.fn();
  vi.stubGlobal('scrollTo', scrollTo);
  render(<App />);
  scrollTo.mockClear();
  await userEvent.click(screen.getByRole('button', { name: 'Start' }));
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/Step 1 of/);
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  vi.unstubAllGlobals();
});
