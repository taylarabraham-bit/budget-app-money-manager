import { formatMoneyAuto } from '@budget-app/ui';
import { MAX_AMOUNT } from '../data/split';

// The single-entry ceiling, shared by every money field. Bills, transfers and
// Log purchase enforced it while nine other dialogs checked only "> 0", so a
// mistyped $99,999,999,999 landed in totals and the report (audit UX-6 / MON-8).

/** True when a typed amount is past the ceiling; null (empty) never is. */
export const overCap = (amount: number | null | undefined): boolean => amount != null && Math.abs(amount) > MAX_AMOUNT;

/** The one "too big" message, with the cap in the household currency rather than a "$1,000,000" literal (audit UI-17). */
export const capMessage = (currency: string): string => `That looks too big - amounts up to ${formatMoneyAuto(MAX_AMOUNT, { currency })} are supported`;
