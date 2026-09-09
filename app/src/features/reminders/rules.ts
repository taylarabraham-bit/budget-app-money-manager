import { formatMoneyAuto } from '@budget-app/ui';
import { selectApprovals, selectOverview } from '../../data/selectors';
import { firstName, fromCents, toCents } from '../../data/split';
import type { HouseholdState } from '../../data/store';
import { daysUntil, formatShortDate, monthKeyOf, todayIso } from '../../lib/dates';
import { currentCardCycle, minPaymentCents, monthlyInterestCents } from '../accounts/interest';
import { lastPaymentOn, selectAccountBalances } from '../accounts/selectors';
import type { Account, AccountTransfer } from '../accounts/types';
import { toBillView } from '../bills/selectors';
import type { Bill } from '../bills/types';
import { selectCashFlow } from '../paydays/selectors';
import type { IncomeSchedule } from '../paydays/types';
import { selectBalances } from '../settle/selectors';
import type { Settlement } from '../settle/types';
import type { Reminder, ReminderPriority } from './types';

export interface ReminderInputs {
  state: HouseholdState;
  bills: Bill[];
  schedules: IncomeSchedule[];
  settlements: Settlement[];
  accounts: Account[];
  transfers: AccountTransfer[];
  /** Which stores still hold the SAMPLE rows (true until that store's first real write). */
  samples: { household: boolean; bills: boolean; paydays: boolean; accounts: boolean };
}

/** Balance with the partner from which a settle-up nudge appears. */
const BALANCE_NUDGE = 50;
/** Hour of the day after which "no earnings logged today" shows. */
const EARNINGS_NUDGE_HOUR = 18;

const TONE_ORDER = { danger: 0, warning: 1, success: 2, info: 3 } as const;

/** How many days before a card's payment due date the first nudge appears. */
const CARD_DUE_LEAD_DAYS = 7;

/** Every reminder that applies right now, most urgent first. */
export function selectReminders({ state, bills, schedules, settlements, accounts, transfers, samples }: ReminderInputs, now: Date = new Date()): Reminder[] {
  const out: Reminder[] = [];
  // A store still holding SAMPLE rows under a REAL household describes money
  // that does not exist. That mixed state is the normal upgrade path (real
  // pre-accounts data + the sample Visa, whose payment window is engineered to
  // always be live), and it must never ring the bell or notify (QA7 R-1). Under
  // a sample household everything shows - the bell is part of the demo - and
  // the provider suppresses native notifications wholesale instead.
  const real = !samples.household;
  const liveBills = real && samples.bills ? [] : bills;
  const liveSchedules = real && samples.paydays ? [] : schedules;
  const liveAccounts = real && samples.accounts ? [] : accounts;
  const currency = state.household.currency;
  const money = (v: number) => formatMoneyAuto(v, { currency });
  const today = todayIso(now);
  const monthKey = monthKeyOf(today);
  const nameOf = (id: string) => firstName(state.members.find((m) => m.id === id)?.name ?? 'Someone');
  const push = (r: Omit<Reminder, 'priority'> & { priority: ReminderPriority }) => out.push(r);

  // Bills
  for (const bill of liveBills) {
    if (bill.paused) continue;
    const view = toBillView(bill, now);
    const payer = nameOf(bill.memberId);
    if (view.days < 0) {
      // Every missed occurrence is owed under option B, so the amount and the
      // copy carry the full arrears, not the oldest instalment alone (QA7 B-1).
      // "60+" when the occurrence cap bit: the count and total are floors (audit MON-7).
      const behind = view.arrearsCount > 1 ? `${money(view.arrearsTotal)} across ${view.arrearsTruncated ? `${view.arrearsCount}+` : view.arrearsCount} missed payments - the oldest` : money(bill.amount);
      push({ id: `bill-overdue:${bill.id}:${bill.nextDue}`, rule: 'bill-overdue', priority: 1, tone: 'danger', icon: '🧾', title: `${bill.name} is overdue`, body: `${behind} was due ${formatShortDate(bill.nextDue, now)} · ${payer} pays`, amount: view.arrearsTotal, action: { label: 'Review', target: { kind: 'route', route: { tab: 'bills' } } } });
    } else if (view.days === 0) {
      push({ id: `bill-due-today:${bill.id}:${bill.nextDue}`, rule: 'bill-due-today', priority: 2, tone: 'warning', icon: '🧾', title: `${bill.name} is due today`, body: `${money(bill.amount)} · ${payer} pays`, amount: bill.amount, action: { label: 'Mark paid', target: { kind: 'route', route: { tab: 'bills' } } } });
    } else if (view.days === 1) {
      push({ id: `bill-due-tomorrow:${bill.id}:${bill.nextDue}`, rule: 'bill-due-tomorrow', priority: 3, tone: 'info', icon: '🧾', title: `${bill.name} is due tomorrow`, body: `${money(bill.amount)} · ${payer} pays`, amount: bill.amount, action: { label: 'View', target: { kind: 'route', route: { tab: 'bills' } } } });
    }
  }

  // Credit-card payments due. Only cards that told us their statement day get
  // date maths; the window opens once the statement has CLOSED (before that the
  // due date is next cycle's, not a deadline) and steps up as the due date
  // nears. Paying in full by the due date is what keeps the card interest-free,
  // so the body says what carrying the balance would cost when the rate is known.
  const cardBalances = selectAccountBalances(liveAccounts, transfers, state.transactions);
  for (const a of liveAccounts) {
    if (a.kind !== 'credit' || a.archived || a.statementDay === undefined) continue;
    const owedCents = cardBalances.get(a.id) ?? 0;
    if (owedCents <= 0) continue;
    const cycle = currentCardCycle(a.statementDay, a.dueDaysAfterStatement ?? 25, today, lastPaymentOn(a.id, transfers));
    if (!cycle.closed) continue;
    const owed = fromCents(owedCents);
    const min = minPaymentCents(owedCents, a.minPaymentPercent, a.minPaymentFloor !== undefined ? toCents(a.minPaymentFloor) : undefined);
    const carryCents = a.apr !== undefined ? monthlyInterestCents(owedCents, a.apr) : 0;
    const facts = [`${money(owed)} owing`, ...(min !== null && min > 0 ? [`minimum ${money(fromCents(min))}`] : []), ...(carryCents > 0 ? [`carrying it costs ≈ ${money(fromCents(carryCents))}/month`] : [])].join(' · ');
    const action = { label: 'Pay card', target: { kind: 'route', route: { tab: 'overview', sub: { name: 'accounts' } } } } as const;
    if (cycle.overdue) {
      // The window closed with no payment logged. The app can't know whether
      // the statement was paid outside its books, so the copy hedges - but
      // silence here read as "all good" exactly while interest starts (QA7 R-5).
      push({
        id: `card-payment-missed:${a.id}:${cycle.dueDate}`,
        rule: 'card-payment-missed',
        priority: 1,
        tone: 'danger',
        icon: '💳',
        title: `${a.name} payment date has passed`,
        body: `${formatShortDate(cycle.dueDate, now)} was the interest-free cutoff and no payment is logged - ${facts}.`,
        amount: owed,
        action,
      });
      continue;
    }
    const days = daysUntil(cycle.dueDate, now);
    if (days > CARD_DUE_LEAD_DAYS) continue;
    if (days <= 0) {
      push({ id: `card-due-today:${a.id}:${cycle.dueDate}`, rule: 'card-due-today', priority: 2, tone: 'warning', icon: '💳', title: `${a.name} payment is due today`, body: `${facts} - pay in full today to keep it interest-free.`, amount: owed, action });
    } else if (days === 1) {
      push({ id: `card-due-tomorrow:${a.id}:${cycle.dueDate}`, rule: 'card-due-tomorrow', priority: 3, tone: 'warning', icon: '💳', title: `${a.name} payment is due tomorrow`, body: facts, amount: owed, action });
    } else {
      push({ id: `card-due-soon:${a.id}:${cycle.dueDate}`, rule: 'card-due-soon', priority: 3, tone: 'info', icon: '💳', title: `${a.name} payment due ${formatShortDate(cycle.dueDate, now)}`, body: facts, amount: owed, action });
    }
  }

  // Budgets (household-wide)
  const overview = selectOverview(state, null, now);
  for (const row of overview.budgets) {
    if (row.limit <= 0) continue;
    if (row.ratio > 1) {
      push({ id: `budget-over:${row.category.id}:${monthKey}`, rule: 'budget-over', priority: 1, tone: 'danger', icon: row.category.icon, title: `${row.category.name} is over budget`, body: `${money(row.spent - row.limit)} over its ${money(row.limit)} limit`, amount: row.spent - row.limit, action: { label: 'Adjust limits', target: { kind: 'route', route: { tab: 'household' } } } });
    } else if (row.ratio >= 0.9) {
      push({ id: `budget-near:${row.category.id}:${monthKey}`, rule: 'budget-near', priority: 3, tone: 'warning', icon: row.category.icon, title: `${row.category.name} is at ${Math.round(row.ratio * 100)}%`, body: `${money(row.limit - row.spent)} left this month`, amount: row.limit - row.spent, action: { label: 'See budgets', target: { kind: 'route', route: { tab: 'overview' } } } });
    }
  }

  // Cash flow before payday. Needs a ceiling: with every category limit at 0
  // ("no limit") there is nothing for the bills to add up to more than (audit
  // MF-4). safeToSpend arrives cent-quantized, so an exactly-even case is 0,
  // not -1e-13 (audit MON-5).
  const cashFlow = selectCashFlow(state, liveBills, liveSchedules, { horizon: 'payday', memberId: null, now });
  if (cashFlow.hasSchedules && cashFlow.hasLimit && cashFlow.safeToSpend < 0) {
    // Keyed on the payday itself, not `until`: `until` collapses to today while a
    // payday is overdue, so a dismissal keyed on it expired every day (audit OB-15).
    const key = cashFlow.nextPayday ? `${cashFlow.nextPayday.schedule.id}:${cashFlow.nextPayday.date}` : cashFlow.until;
    push({ id: `cashflow-negative:${key}`, rule: 'cashflow-negative', priority: 1, tone: 'warning', icon: '🛡️', title: "Bills before payday add up to more than what's left", body: `${money(cashFlow.billsDue)} due before ${cashFlow.untilLabel}${cashFlow.plannedSavings > 0 ? ` plus ${money(cashFlow.plannedSavings)} of savings` : ''}, against ${money(cashFlow.limitLeft)} left`, amount: -cashFlow.safeToSpend, action: { label: 'See bills', target: { kind: 'route', route: { tab: 'bills' } } } });
  }

  // Daily earnings
  if (state.household.dailyEarningTarget > 0 && now.getHours() >= EARNINGS_NUDGE_HOUR && overview.todayEarnings === 0) {
    push({ id: `no-earnings-today:${today}`, rule: 'no-earnings-today', priority: 3, tone: 'info', icon: '💵', title: 'No earnings logged today', body: `Target ${money(state.household.dailyEarningTarget)}/day - log what you earned.`, action: { label: 'Log earnings', target: { kind: 'log', log: 'income' } } });
  }

  // Partner approval
  const approvals = selectApprovals(state);
  for (const t of approvals.awaitingMe) {
    push({ id: `pending-approval:${t.id}`, rule: 'pending-approval', priority: 2, tone: 'warning', icon: '🤝', title: `${nameOf(t.loggedBy ?? t.memberId)} logged ${money(Math.abs(t.amount))} to confirm`, body: `${t.title} · ${state.categories.find((c) => c.id === t.categoryId)?.name ?? 'Uncategorised'}`, amount: Math.abs(t.amount), action: { label: 'Review', target: { kind: 'route', route: { tab: 'activity', params: { kind: 'pending' } } } } });
  }
  for (const t of approvals.disputedMine) {
    push({ id: `disputed:${t.id}:${t.disputed?.at ?? ''}`, rule: 'disputed', priority: 2, tone: 'warning', icon: '⚠️', title: `${nameOf(t.disputed!.byMemberId)} disputed ${t.title}`, body: t.disputed?.reason ? `"${t.disputed.reason}" - make it personal, delete it, or talk it through.` : 'Make it personal, delete it, or talk it through.', amount: Math.abs(t.amount), action: { label: 'Review', target: { kind: 'route', route: { tab: 'activity', params: { kind: 'pending' } } } } });
  }

  // Paydays today
  for (const s of liveSchedules) {
    if (s.paused) continue;
    if (s.nextDate === today) {
      push({ id: `payday:${s.id}:${s.nextDate}`, rule: 'payday', priority: 2, tone: 'success', icon: '📅', title: `Payday: ${nameOf(s.memberId)}'s ${s.name}`, body: `${money(s.amount)} expected today - mark it received when it lands.`, amount: s.amount, action: { label: 'Paydays', target: { kind: 'route', route: { tab: 'bills', sub: { name: 'paydays' } } } } });
    } else if (s.nextDate < today) {
      // Expected but never marked received: nudge until it is received or the date is fixed.
      const late = daysUntil(s.nextDate, now) * -1;
      push({ id: `payday-overdue:${s.id}:${s.nextDate}`, rule: 'payday-overdue', priority: 2, tone: 'warning', icon: '📅', title: `${nameOf(s.memberId)}'s ${s.name} hasn't been marked received`, body: `${money(s.amount)} was expected ${late} ${late === 1 ? 'day' : 'days'} ago - mark it received, or fix the date if it moved.`, amount: s.amount, action: { label: 'Paydays', target: { kind: 'route', route: { tab: 'bills', sub: { name: 'paydays' } } } } });
    }
  }

  // Goal deadlines
  for (const g of state.goals) {
    if (g.status !== 'active' || !g.deadlineDate || g.saved >= g.target) continue;
    const days = daysUntil(g.deadlineDate, now);
    if (days < 0 || days > 7) continue;
    push({ id: `goal-deadline:${g.id}:${g.deadlineDate}`, rule: 'goal-deadline', priority: 3, tone: 'warning', icon: g.icon, title: days === 0 ? `${g.name} is due today` : `${g.name} is due in ${days} day${days === 1 ? '' : 's'}`, body: `${money(g.target - g.saved)} to go`, amount: g.target - g.saved, action: { label: 'Add money', target: { kind: 'route', route: { tab: 'goals' } } } });
  }

  // Partner balance
  const balances = selectBalances(state, settlements, now);
  if (balances.mine.status !== 'square' && balances.mine.amount >= BALANCE_NUDGE && balances.mine.with) {
    const other = firstName(balances.mine.with.name);
    push({ id: `partner-balance:${balances.mine.with.id}:${monthKey}`, rule: 'partner-balance', priority: 3, tone: 'info', icon: '🤝', title: balances.mine.status === 'owed' ? `${other} owes you ${money(balances.mine.amount)}` : `You owe ${other} ${money(balances.mine.amount)}`, body: 'Settle up whenever suits you both.', amount: balances.mine.amount, action: { label: 'Settle up', target: { kind: 'route', route: { tab: 'overview', sub: { name: 'settle' } } } } });
  }

  return out.sort((a, b) => a.priority - b.priority || TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || (b.amount ?? 0) - (a.amount ?? 0) || a.title.localeCompare(b.title));
}
