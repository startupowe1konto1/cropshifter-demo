import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StateBoundary } from './StateBoundary';

describe('StateBoundary', () => {
  it('shows the children when ready', () => {
    render(
      <StateBoundary state="ready">
        <p>Field profile</p>
      </StateBoundary>,
    );
    expect(screen.getByText('Field profile')).toBeInTheDocument();
  });

  it('shows a skeleton that names the source while loading', () => {
    render(
      <StateBoundary state="loading" source="NASA POWER">
        <p>Field profile</p>
      </StateBoundary>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading NASA POWER');
    expect(screen.queryByText('Field profile')).not.toBeInTheDocument();
  });

  it('still has loading text when no source is named', () => {
    render(
      <StateBoundary state="loading">
        <p>Field profile</p>
      </StateBoundary>,
    );
    expect(screen.getByText('Loading data')).toBeInTheDocument();
  });

  it('says there is no connection when offline', () => {
    render(
      <StateBoundary state="offline">
        <p>Field profile</p>
      </StateBoundary>,
    );
    expect(screen.getByText('No connection')).toBeInTheDocument();
    expect(screen.getByText('This part needs the internet. The parts that still work are shown.')).toBeInTheDocument();
    expect(screen.queryByText('Field profile')).not.toBeInTheDocument();
  });

  it('shows "No data" and the reason', () => {
    render(
      <StateBoundary state="no-data" reason="No money tables for this country yet">
        <p>Field profile</p>
      </StateBoundary>,
    );
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('No money tables for this country yet')).toBeInTheDocument();
    expect(screen.queryByText('Field profile')).not.toBeInTheDocument();
  });

  it('names the source that failed, gives the reason and retries', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <StateBoundary state="error" source="SoilGrids" reason="The request timed out" onRetry={onRetry}>
        <p>Field profile</p>
      </StateBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('SoilGrids did not answer');
    expect(screen.getByText('The request timed out')).toBeInTheDocument();
    expect(screen.queryByText('Field profile')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has no retry button without onRetry, and still names a failure without a source', () => {
    render(
      <StateBoundary state="error">
        <p>Field profile</p>
      </StateBoundary>,
    );
    expect(screen.getByText('The source did not answer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
