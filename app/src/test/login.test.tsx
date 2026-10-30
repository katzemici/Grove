import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

describe('Login gate', () => {
  it('shows the login page, creates an account, opens the workspace, and signs out', async () => {
    localStorage.clear();
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /ginger cat naps/i })).toBeInTheDocument();

    // Validation runs before anything is saved.
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    // Register swaps in the suit cat; the napping cat is hidden from assistive tech.
    expect(screen.getByRole('img', { name: /cat in a suit/i })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /ginger cat naps/i })).toBeNull();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mochi' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'mochi@grove.app' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'whiskers1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    const profileButton = await screen.findByRole('button', { name: 'Open your profile' }, { timeout: 5000 });
    expect(profileButton).toHaveTextContent('Mochi');
    expect(profileButton.querySelector('.avatar')).toHaveStyle({
      backgroundImage: 'url("/img/cat-sea.webp")',
    });
    expect(await screen.findByAltText('Ginger cat resting on grass among daisies')).toBeInTheDocument();

    fireEvent.click(profileButton);
    fireEvent.click(await screen.findByRole('button', { name: /Sign out/ }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument());
  });

  it('opens straight into register at /register and goes back to login', async () => {
    localStorage.clear();
    render(
      <MemoryRouter initialEntries={['/register']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /cat in a suit/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /ginger cat naps/i })).toBeInTheDocument();
  });
});
