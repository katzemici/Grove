import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Journal from '../pages/Journal';
import { dailyNotePath, dailyTemplate, dailyTitle } from '../lib/journal';

// jsdom has no ResizeObserver; LiquidTabs (Write/Read switch) needs one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

describe('Journal page (browser notes)', () => {
  it('opens with the welcome note, creates a note and autosaves it', async () => {
    localStorage.clear();
    render(<Journal />);

    expect((await screen.findAllByRole('button', { name: /Welcome/ })).length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole('button', { name: /New note/ }));
    const title = await screen.findByLabelText('Note title (file name)');
    expect(title).toHaveValue('Untitled');

    fireEvent.change(title, { target: { value: 'Rainy day' } });
    await act(async () => {
      fireEvent.blur(title);
    });
    const text = screen.getByLabelText('Note text');
    fireEvent.change(text, { target: { value: 'Tea and #rain' } });

    await waitFor(
      () => {
        const saved = JSON.parse(localStorage.getItem('grove:journal:vault') ?? '{}');
        expect(saved.notes?.['Rainy day.md']?.content).toBe('Tea and #rain');
        expect(saved.notes?.['Untitled.md']).toBeUndefined();
      },
      { timeout: 2000 },
    );
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it("creates today's daily note from the template once, then reopens it", async () => {
    localStorage.clear();
    render(<Journal />);
    await screen.findAllByRole('button', { name: /Welcome/ });

    const path = dailyNotePath();
    const today = dailyTitle();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Today$/ }));
    });
    expect(await screen.findByLabelText('Note title (file name)')).toHaveValue(today);
    expect(screen.getByLabelText('Note text')).toHaveValue(dailyTemplate());

    const read = () => JSON.parse(localStorage.getItem('grove:journal:vault') ?? '{}').notes ?? {};
    await waitFor(() => expect(read()[path]?.content).toBe(dailyTemplate()));

    // Second click opens the same note instead of making "2026-10-28 1".
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Today$/ }));
    });
    expect(Object.keys(read()).filter((p) => p.startsWith('Daily/'))).toEqual([path]);
  });
});
