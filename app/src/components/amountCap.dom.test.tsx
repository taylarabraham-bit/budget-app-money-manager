// @vitest-environment jsdom
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HouseholdProvider } from '../data/store';
import { AccountsProvider } from '../features/accounts/store';
import { AccountFormDialog } from '../features/accounts/AccountFormDialog';
import { BillsProvider } from '../features/bills/store';
import { BillFormDialog } from '../features/bills/BillFormDialog';
import { ListItemDialog } from '../features/lists/ListItemDialog';
import { WishFormDialog } from '../features/lists/WishFormDialog';
import { PaydayFormDialog } from '../features/paydays/PaydayFormDialog';
import { ReceiveDialog } from '../features/paydays/ReceiveDialog';
import { QuickAddProvider } from '../features/quickadd/store';
import { QuickAddManageDialog } from '../features/quickadd/QuickAddManageDialog';
import { SettleUpDialog } from '../features/settle/SettleUpDialog';
import { HOME, NavigationContext } from '../navigation';
import { PRIYA, SAM, goal, member, payday } from '../test/fixtures';
import { CategoryLimitDialog } from './CategoryLimitDialog';
import { GoalDialog } from './GoalDialog';
import { GoalFormDialog } from './GoalFormDialog';
import { HouseholdSettingsDialog } from './HouseholdSettingsDialog';
import { LogPurchaseDialog } from './LogPurchaseDialog';
import { MemberDialog } from './MemberDialog';

// Every money field enforces the same single-entry ceiling. Five entry points
// did, nine only checked "> 0", so a mistyped $99,999,999,999 sailed into
// totals, cash flow and the report (audit UX-6 / MON-8). One table, one rule.

afterEach(cleanup);

const noop = () => {};
const OVER = '2000000';
const TOO_BIG = /That looks too big/;

function Providers({ children }: { children: ReactNode }) {
  return (
    <NavigationContext.Provider value={{ route: HOME, go: noop, openSettings: noop }}>
      <HouseholdProvider>
        <AccountsProvider persist={false}>
          <BillsProvider persist={false}>
            <QuickAddProvider persist={false}>{children}</QuickAddProvider>
          </BillsProvider>
        </AccountsProvider>
      </HouseholdProvider>
    </NavigationContext.Provider>
  );
}

interface Case {
  name: string;
  render: (onSubmit: ReturnType<typeof vi.fn>) => ReactElement;
  /** Anything that has to happen before the amount field exists (open a sub-mode, start an edit). */
  setup?: () => Promise<void>;
  /** Accessible name of the money field. */
  field: string;
  /** Other required fields, filled so the cap is the only thing standing in the way. */
  fill?: Record<string, string>;
  /** Accessible name of the button that submits. */
  save: string;
  /** The dialog reports through an onSubmit prop (store-backed ones do not). */
  spied?: boolean;
}

const cases: Case[] = [
  { name: 'GoalDialog (Add money)', render: () => <GoalDialog goal={goal('g1', { target: 1000, saved: 100 })} onClose={noop} />, setup: async () => userEvent.click(screen.getByRole('button', { name: 'Add money' })), field: 'Amount', save: 'Add to goal' },
  { name: 'GoalFormDialog (Target)', render: () => <GoalFormDialog open onClose={noop} />, field: 'Target', fill: { Name: 'Trip' }, save: 'Save goal' },
  { name: 'MemberDialog', render: (spy) => <MemberDialog open onClose={noop} onSubmit={spy} />, field: 'Monthly budget', fill: { Name: 'Zed' }, save: 'Add member', spied: true },
  { name: 'CategoryLimitDialog', render: (spy) => <CategoryLimitDialog open onClose={noop} onSubmit={spy} />, field: 'Monthly limit', fill: { Name: 'Zed' }, save: 'Add category', spied: true },
  { name: 'HouseholdSettingsDialog', render: (spy) => <HouseholdSettingsDialog open onClose={noop} onSubmit={spy} />, field: 'Daily earnings target', save: 'Save', spied: true },
  { name: 'PaydayFormDialog', render: (spy) => <PaydayFormDialog open onClose={noop} onSubmit={spy} />, field: 'Amount', fill: { Name: 'Zed' }, save: 'Add payday', spied: true },
  { name: 'ReceiveDialog', render: (spy) => <ReceiveDialog payday={payday('p1', { variable: true })} currency="USD" onClose={noop} onSubmit={spy} />, field: 'Amount', save: 'Log income', spied: true },
  { name: 'WishFormDialog', render: (spy) => <WishFormDialog open onClose={noop} onSubmit={spy} />, field: 'Estimated price', fill: { Name: 'Zed' }, save: 'Add wish', spied: true },
  { name: 'ListItemDialog', render: (spy) => <ListItemDialog open onClose={noop} onSubmit={spy} />, field: 'Estimated price', fill: { Item: 'Zed' }, save: 'Add', spied: true },
  { name: 'QuickAddManageDialog (edit row)', render: () => <QuickAddManageDialog open onClose={noop} />, setup: async () => userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!), field: 'Amount', save: 'Save' },
  { name: 'BillFormDialog', render: (spy) => <BillFormDialog open onClose={noop} onSubmit={spy} />, field: 'Amount', fill: { Name: 'Zed' }, save: 'Add bill', spied: true },
  { name: 'AccountFormDialog', render: (spy) => <AccountFormDialog open onClose={noop} onSubmit={spy} />, field: 'Balance today', fill: { Name: 'Zed' }, save: 'Add everyday', spied: true },
  { name: 'LogPurchaseDialog', render: () => <LogPurchaseDialog open onClose={noop} />, field: 'Amount', save: 'Save purchase' },
  { name: 'SettleUpDialog', render: (spy) => <SettleUpDialog open me={member(PRIYA)} other={member(SAM)} net={0} currency="USD" onClose={noop} onSubmit={spy} />, field: 'Amount', save: 'Record payment', spied: true },
];

async function enter(field: string, text: string) {
  const input = screen.getByRole('textbox', { name: field });
  await userEvent.clear(input);
  await userEvent.type(input, text);
}

describe('every money field stops at MAX_AMOUNT', () => {
  it.each(cases)('$name refuses 2,000,000 and says so', async (c) => {
    const spy = vi.fn();
    render(<Providers>{c.render(spy)}</Providers>);
    await c.setup?.();
    for (const [label, text] of Object.entries(c.fill ?? {})) await enter(label, text);
    await enter(c.field, OVER);
    await userEvent.click(screen.getByRole('button', { name: c.save }));
    expect(screen.getByText(TOO_BIG)).toBeTruthy();
    if (c.spied) expect(spy).not.toHaveBeenCalled();
  });

  it('control: exactly the cap still saves (the table is not passing on some other error)', async () => {
    const spy = vi.fn();
    render(
      <Providers>
        <MemberDialog open onClose={noop} onSubmit={spy} />
      </Providers>,
    );
    await enter('Name', 'Zed');
    await enter('Monthly budget', '1000000');
    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));
    expect(screen.queryByText(TOO_BIG)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
