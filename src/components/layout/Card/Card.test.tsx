// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Card } from './Card';

// Cards are the sections of every screen, so their titles are headings a
// screen reader can jump between (audit UI-27), and a tappable card must be
// operable from the keyboard like the button it claims to be (DS-11).

afterEach(cleanup);

describe('the title is a heading - UI-27', () => {
  it('is an h3 by default and keeps its class', () => {
    render(<Card title="Reminders">body</Card>);
    const heading = screen.getByRole('heading', { level: 3, name: 'Reminders' });
    expect(heading.classList.contains('bdg-card__title')).toBe(true);
  });

  it('takes the level the screen needs', () => {
    render(<Card title="Your data" headingLevel={2} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Your data' })).toBeDefined();
  });

  it('renders no heading without a title', () => {
    render(<Card subtitle="Just a line">body</Card>);
    expect(screen.queryByRole('heading')).toBeNull();
  });
});

describe('keyboard activation - DS-11', () => {
  it('fires onClick on Enter and Space when interactive', async () => {
    const onClick = vi.fn();
    render(
      <Card interactive onClick={onClick}>
        Tap me
      </Card>,
    );
    const card = screen.getByRole('button');
    expect(card.tabIndex).toBe(0);
    card.focus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('leaves a nested control to do its own thing', async () => {
    const onClick = vi.fn();
    const { container } = render(
      <Card interactive onClick={onClick}>
        <button type="button">Inner</button>
      </Card>,
    );
    // The card itself is role="button" too, so reach the real one by element.
    container.querySelector('button')!.focus();
    await userEvent.keyboard('{Enter}');
    // The inner button's own click bubbles once; the card must not add a second.
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is plain content when not interactive', () => {
    render(<Card title="Static">body</Card>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('body').closest('.bdg-card')!.getAttribute('tabindex')).toBeNull();
  });
});
