// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ScreenActions } from './ScreenActions';

// The header actions are a phone's only way into Settings (desktop has the
// sidebar brand). They must survive a household with no signed-in member
// (audit UI-30).

const household = vi.hoisted(() => ({ members: [] as Array<{ id: string; name: string; color: string }>, currentMemberId: 'm_nobody' }));
const openSettings = vi.hoisted(() => vi.fn());
vi.mock('../data/store', () => ({ useHousehold: () => household }));
vi.mock('../navigation', () => ({ useNavigation: () => ({ openSettings }) }));
vi.mock('../features/reminders', () => ({ RemindersButton: () => <button type="button">Reminders</button> }));

afterEach(cleanup);

describe('ScreenActions', () => {
  it('renders the bell and a generic Settings button when no member matches', () => {
    render(<ScreenActions />);
    expect(screen.getByRole('button', { name: 'Reminders' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('renders the signed-in avatar as the Settings button when the member exists', () => {
    household.members = [{ id: 'm_nobody', name: 'Priya Natarajan', color: 'coral' }];
    render(<ScreenActions />);
    expect(screen.getByRole('button', { name: 'Settings (signed in as Priya Natarajan)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
  });
});
