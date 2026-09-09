// Faster logging: one-tap favourites and recent-merchant suggestions for the
// Log purchase dialog. Wire-up: wrap the app in <QuickAddProvider>.
export { QuickAddProvider, useQuickAdds, isQuickAdd, selectQuickAdds } from './store';
export { QuickAddManageDialog } from './QuickAddManageDialog';
export { selectMerchantSuggestions } from './suggestions';
export type { QuickAdd, QuickAddInput, QuickAddKind } from './types';
