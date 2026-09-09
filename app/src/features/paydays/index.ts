// Paydays & cash flow. Wire-up: wrap the app in <PaydaysProvider> (inside
// <HouseholdProvider>), route `{ tab: 'bills', sub: 'paydays' }` to
// <PaydaysScreen />, and on Overview use selectCashFlow for the hero
// safe-to-spend figure plus <CashFlowCard /> for what is due before payday.
export { PaydaysProvider, usePaydays, isIncomeSchedule } from './store';
export { PaydaysScreen } from './PaydaysScreen';
export { CashFlowCard } from './CashFlowCard';
export { PaydayRow } from './PaydayRow';
export { selectPaydays, selectPaydaysSummary, groupPaydays, toPaydayView, incomeRatio, selectCashFlow, payLabel, horizonText } from './selectors';
export type { PaydayView, CashFlow } from './selectors';
export type { IncomeSchedule, IncomeScheduleInput } from './types';
