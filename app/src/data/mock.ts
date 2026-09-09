import { toIsoDateTime } from '../lib/dates';
import type { Category, Goal, GoalContribution, Household, HouseholdMember, TransactionRecord } from './types';

// Mock data stands in for Supabase until the backend is wired. Dates are
// generated relative to "now" so Today / Yesterday / this-week figures stay
// meaningful whenever the app is opened.

/** Local ISO datetime for `days` days ago at the given hour. */
export function daysAgo(days: number, hour = 12, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  // A "today" entry must not sit in the future, or it would outrank purchases logged right now.
  if (d.getTime() > Date.now()) d.setTime(Date.now() - (hour + 1) * 60_000);
  return toIsoDateTime(d);
}

export const household: Household = {
  id: 'hh_1',
  name: 'The Okafor-Natarajans',
  currency: 'USD',
  dailyEarningTarget: 150,
  // Shared purchases are split between the two adults; Maya is on an allowance.
  defaultSplit: { mode: 'ratio', shares: { m_priya: 0.5, m_sam: 0.5 } },
  requireApproval: false,
};

export const members: HouseholdMember[] = [
  { id: 'm_priya', name: 'Priya Natarajan', color: 'violet', role: 'Owner', monthlyLimit: 1800 },
  { id: 'm_sam', name: 'Sam Okafor', color: 'sky', role: 'Partner', monthlyLimit: 1200 },
  { id: 'm_maya', name: 'Maya Okafor', color: 'coral', role: 'Teen', monthlyLimit: 150 },
];

/** The signed-in member. */
export const currentMemberId = 'm_priya';

export const categories: Category[] = [
  { id: 'c_groceries', name: 'Groceries', icon: '🛒', color: 'primary', limit: 450, kind: 'expense', defaultShared: true },
  { id: 'c_dining', name: 'Dining out', icon: '🍜', color: 'coral', limit: 280, kind: 'expense' },
  { id: 'c_transport', name: 'Transport', icon: '🚌', color: 'sky', limit: 120, kind: 'expense' },
  { id: 'c_home', name: 'Home & utilities', icon: '🏠', color: 'lime', limit: 800, kind: 'expense', defaultShared: true },
  { id: 'c_fun', name: 'Fun', icon: '🎮', color: 'violet', limit: 150, kind: 'expense' },
  { id: 'c_subs', name: 'Subscriptions', icon: '🎵', color: 'rose', limit: 60, kind: 'expense', defaultShared: true },
  { id: 'c_allowance', name: "Maya's allowance", icon: '🧒', color: 'amber', limit: 80, kind: 'expense' },
  { id: 'c_income', name: 'Income', icon: '💼', color: 'primary', limit: 0, kind: 'income' },
];

let seq = 0;
const t = (
  days: number,
  hour: number,
  title: string,
  amount: number,
  categoryId: string,
  memberId: string,
  extra: Partial<TransactionRecord> = {},
): TransactionRecord => ({ id: `t_${++seq}`, title, amount, date: daysAgo(days, hour), categoryId, memberId, ...extra });

export const transactions: TransactionRecord[] = [
  // today
  t(0, 9, 'Freelance invoice #42', 148.5, 'c_income', 'm_priya'),
  t(0, 8, 'Bus pass', -2.75, 'c_transport', 'm_sam'),
  t(0, 17, "Trader Joe's", -64.2, 'c_groceries', 'm_priya', { shared: true, accountId: 'a_visa' }),
  // yesterday
  t(1, 9, 'Tutoring (2h)', 90, 'c_income', 'm_sam'),
  t(1, 12, 'Ice cream', -6.5, 'c_fun', 'm_maya'),
  t(1, 19, 'Thai takeaway', -42.8, 'c_dining', 'm_sam', { shared: true, loggedBy: 'm_sam', pending: true, needsApprovalFrom: ['m_priya'], accountId: 'a_visa' }),
  // earlier this week
  t(2, 10, 'Freelance invoice #41', 210, 'c_income', 'm_priya', { accountId: 'a_everyday' }),
  t(2, 13, 'Gas', -48, 'c_transport', 'm_sam'),
  t(3, 9, 'Tutoring (1h)', 45, 'c_income', 'm_sam'),
  t(3, 18, 'Board game night', -38, 'c_fun', 'm_priya', { shared: true, loggedBy: 'm_priya', pending: true, disputed: { byMemberId: 'm_sam', reason: "Wasn't there that night", at: daysAgo(2, 10) } }),
  t(3, 20, 'Electricity', -92.1, 'c_home', 'm_priya', { recurring: true, shared: true, accountId: 'a_everyday' }),
  t(4, 9, 'Freelance invoice #40', 120, 'c_income', 'm_priya'),
  t(4, 12, 'Lunch with Dev', -28.4, 'c_dining', 'm_priya'),
  t(5, 9, 'Tutoring (3h)', 135, 'c_income', 'm_sam'),
  t(5, 16, 'Farmers market', -38.5, 'c_groceries', 'm_sam', { shared: true }),
  t(6, 9, 'Babysitting', 60, 'c_income', 'm_maya'),
  t(6, 14, 'Concert tickets', -110, 'c_fun', 'm_sam', { pending: true, note: 'Refund requested - show moved' }),
  t(6, 11, 'Weekly allowance', -20, 'c_allowance', 'm_maya'),
  // last week
  t(7, 18, 'Pizza Friday', -36.9, 'c_dining', 'm_priya', { shared: true }),
  t(8, 9, 'Freelance invoice #39', 180, 'c_income', 'm_priya'),
  t(8, 12, 'Whole Foods', -88.3, 'c_groceries', 'm_priya', { shared: true, accountId: 'a_visa' }),
  t(9, 7, 'Spotify family', -16.99, 'c_subs', 'm_sam', { recurring: true, shared: true, accountId: 'a_visa' }),
  t(9, 13, 'Train to Aunt Ngozi', -31, 'c_transport', 'm_maya'),
  t(10, 9, 'Tutoring (2h)', 90, 'c_income', 'm_sam'),
  t(10, 19, 'Sushi date', -38, 'c_dining', 'm_sam', { shared: true }),
  t(11, 9, 'Salary', 2400, 'c_income', 'm_priya', { accountId: 'a_everyday' }),
  t(11, 10, 'Internet', -59.99, 'c_home', 'm_sam', { recurring: true, shared: true, accountId: 'a_everyday' }),
  t(12, 15, 'Costco run', -121.4, 'c_groceries', 'm_sam', { shared: true, accountId: 'a_visa' }),
  t(13, 11, 'Weekly allowance', -20, 'c_allowance', 'm_maya'),
  t(13, 17, 'Movie night', -24, 'c_fun', 'm_maya'),
  // earlier this month
  t(16, 9, 'Rent', -0, 'c_home', 'm_priya'),
  t(18, 12, 'Water bill', -41.2, 'c_home', 'm_priya', { recurring: true, shared: true }),
  t(20, 11, 'Weekly allowance', -20, 'c_allowance', 'm_maya'),
  t(21, 13, 'Netflix', -15.49, 'c_subs', 'm_priya', { recurring: true, shared: true }),
  t(22, 19, 'Birthday dinner', -96.5, 'c_dining', 'm_priya', { shared: true, split: [{ memberId: 'm_priya', amount: 60.5 }, { memberId: 'm_sam', amount: 36 }], note: 'Sam covered the wine' }),
].filter((x) => x.amount !== 0);

export const goals: Goal[] = [
  { id: 'g_holiday', name: 'Holiday fund', icon: '✈️', target: 3000, saved: 1840, deadlineDate: '2026-12-20', contributorIds: ['m_priya', 'm_sam', 'm_maya'], status: 'active', lastContributionAt: daysAgo(3, 9) },
  { id: 'g_laptop', name: 'New laptop', icon: '💻', target: 1400, saved: 320, contributorIds: ['m_sam'], status: 'paused', lastContributionAt: daysAgo(40, 9) },
  { id: 'g_bikes', name: 'Bikes for the kids', icon: '🚲', target: 900, saved: 120, deadlineDate: '2027-03-01', contributorIds: ['m_priya', 'm_sam'], status: 'active', lastContributionAt: daysAgo(12, 9) },
  { id: 'g_emergency', name: 'Emergency savings', icon: '🛟', target: 2000, saved: 2000, contributorIds: ['m_priya', 'm_sam'], status: 'completed', lastContributionAt: daysAgo(30, 9) },
];

let cseq = 0;
const c = (goalId: string, memberId: string, amount: number, days: number): GoalContribution => ({ id: `gc_${++cseq}`, goalId, memberId, amount, date: daysAgo(days, 9) });

/** Contribution ledger - sums to each goal's `saved`. */
export const goalContributions: GoalContribution[] = [
  // Holiday fund: 1840
  c('g_holiday', 'm_priya', 300, 60), c('g_holiday', 'm_sam', 250, 58), c('g_holiday', 'm_priya', 300, 31), c('g_holiday', 'm_sam', 250, 30),
  c('g_holiday', 'm_maya', 120, 24), c('g_holiday', 'm_priya', 300, 10), c('g_holiday', 'm_sam', 200, 8), c('g_holiday', 'm_maya', 120, 3),
  // Bikes for the kids: 120
  c('g_bikes', 'm_priya', 70, 19), c('g_bikes', 'm_sam', 50, 12),
  // New laptop (paused): 320
  c('g_laptop', 'm_sam', 200, 75), c('g_laptop', 'm_sam', 120, 40),
  // Emergency savings (reached): 2000
  c('g_emergency', 'm_priya', 700, 120), c('g_emergency', 'm_sam', 500, 90), c('g_emergency', 'm_priya', 500, 60), c('g_emergency', 'm_sam', 300, 30),
];
