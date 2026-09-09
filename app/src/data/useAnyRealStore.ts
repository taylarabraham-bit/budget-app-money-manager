import { useAccounts } from '../features/accounts/store';
import { useBills } from '../features/bills/store';
import { useLists } from '../features/lists/store';
import { usePaydays } from '../features/paydays/store';
import { useQuickAdds } from '../features/quickadd/store';
import { useSettlements } from '../features/settle/store';
import { useHousehold } from './store';

/**
 * True when ANY store holds real (non-sample) rows. Setup mode ("fresh" wipes
 * everything on Finish) and Settings' "Restore the sample household" must
 * agree on this: Settings used to leave the accounts store out, so one bank
 * account under the sample household put the app in wipe-on-finish mode with
 * no way back to the sample (audit UI-14). Mixed states count: real bills
 * under a sample household still deserve the way back (QA UX-2).
 */
export function useAnyRealStore(): boolean {
  const { isSample } = useHousehold();
  const bills = useBills();
  const settlements = useSettlements();
  const paydays = usePaydays();
  const lists = useLists();
  const quickAdds = useQuickAdds();
  const accounts = useAccounts();
  return !isSample || !bills.isSample || !settlements.isSample || !paydays.isSample || !lists.isSample || !quickAdds.isSample || !accounts.isSample;
}
