import { combineDateTime, daysFromNow } from '../../lib/dates';
import { dayOfMonth } from '../../lib/frequency';
import type { Account, AccountTransfer } from './types';

// Sample accounts for the mock household (ids match data/mock.ts members).
// Realistic full-length names on purpose: the pre-packaging UI audit tests
// truncation with them. Dates are relative to now so the sample never goes
// stale - including the Visa's statement cycle: its due date lands ~3 days
// out whenever the sample is generated, so the card-due reminder (the bell's
// longest strings) is always rendered in demos and audit runs instead of
// only surfacing for one week a month.

export function sampleAccounts(): Account[] {
  const created = new Date().toISOString();
  // With the 25-day grace period, a statement that closed 22 days ago falls due
  // in ~3 days. Clamped to 28 so short months only pull the due date closer,
  // never behind today.
  const statementDay = Math.min(28, dayOfMonth(daysFromNow(-22)));
  return [
    { id: 'a_everyday', name: 'Joint Everyday Account', kind: 'everyday', openingBalance: 2361.4, createdAt: created },
    { id: 'a_saver', name: 'House Deposit Saver', kind: 'savings', openingBalance: 8450, note: 'Auto-transfer every payday', createdAt: created },
    {
      id: 'a_visa',
      name: 'Platinum Rewards Visa',
      kind: 'credit',
      openingBalance: 862.45,
      apr: 20.99,
      creditLimit: 6000,
      statementDay,
      dueDaysAfterStatement: 25,
      minPaymentPercent: 2,
      minPaymentFloor: 25,
      createdAt: created,
    },
  ];
}

export function sampleTransfers(): AccountTransfer[] {
  const created = new Date().toISOString();
  return [
    { id: 'at_saver_auto', fromAccountId: 'a_everyday', toAccountId: 'a_saver', amount: 250, date: combineDateTime(daysFromNow(-6), '09:00'), memberId: 'm_priya', note: 'Payday auto-transfer', createdAt: created },
    { id: 'at_visa_payment', fromAccountId: 'a_everyday', toAccountId: 'a_visa', amount: 300, date: combineDateTime(daysFromNow(-13), '18:30'), memberId: 'm_sam', note: 'Card payment', createdAt: created },
  ];
}
