import { daysFromNow } from '../../lib/dates';
import type { IncomeSchedule } from './types';

/** Sample paydays for the mock household (ids match data/mock.ts). Dates are relative to now. */
export function sampleSchedules(): IncomeSchedule[] {
  const created = new Date().toISOString();
  return [
    { id: 'p_salary', memberId: 'm_priya', name: 'Salary', amount: 2400, frequency: 'monthly', nextDate: daysFromNow(19), categoryId: 'c_income', accountId: 'a_everyday', lastReceived: daysFromNow(-11), createdAt: created },
    { id: 'p_tutoring', memberId: 'm_sam', name: 'Tutoring', amount: 450, frequency: 'fortnightly', nextDate: daysFromNow(3), categoryId: 'c_income', variable: true, lastReceived: daysFromNow(-11), createdAt: created },
    { id: 'p_babysitting', memberId: 'm_maya', name: 'Babysitting', amount: 60, frequency: 'weekly', nextDate: daysFromNow(5), categoryId: 'c_income', paused: true, createdAt: created },
  ];
}
