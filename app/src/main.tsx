import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@budget-app/ui/styles.css';
import './app.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { requestPersistentStorage, restoreDurableMirror } from './data/durable';
import { STORAGE_KEYS } from './data/persist';
import { SettingsProvider } from './data/settings';
import { HouseholdProvider } from './data/store';
import { AccountsProvider } from './features/accounts';
import { BillsProvider } from './features/bills';
import { PaydaysProvider } from './features/paydays';
import { SettlementsProvider } from './features/settle';
import { QuickAddProvider } from './features/quickadd';
import { ListsProvider } from './features/lists';
import { RemindersProvider } from './features/reminders';
import { LogPurchaseProvider } from './components/LogPurchaseProvider';
import { SyncProvider } from './sync';

async function boot() {
  // Packaged builds: if the OS cleared WebView storage, pull the budget data
  // back from app-private storage BEFORE any provider reads localStorage, and
  // ask the platform not to evict it again. Both resolve instantly in a
  // browser tab (the persist request is fire-and-forget).
  const restored = await restoreDurableMirror();
  if (restored === 'restored') {
    // index.html's pre-paint script read the theme BEFORE this restore, from an
    // empty storage - re-apply it now so a dark-theme user does not get a light
    // flash on the boot after an eviction (audit OB-12). Mirrors that script.
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) ?? 'null') as { theme?: unknown } | null;
      if (s?.theme === 'dark') document.documentElement.dataset.theme = 'dark';
    } catch {
      // unreadable settings: the provider applies the default shortly
    }
  }
  void requestPersistentStorage();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <SettingsProvider>
          <HouseholdProvider>
            <BillsProvider>
              <PaydaysProvider>
                <AccountsProvider>
                  <SettlementsProvider>
                    <ListsProvider>
                      <QuickAddProvider>
                        <RemindersProvider>
                          <SyncProvider>
                            <LogPurchaseProvider>
                              <App />
                            </LogPurchaseProvider>
                          </SyncProvider>
                        </RemindersProvider>
                      </QuickAddProvider>
                    </ListsProvider>
                  </SettlementsProvider>
                </AccountsProvider>
              </PaydaysProvider>
            </BillsProvider>
          </HouseholdProvider>
        </SettingsProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

void boot();
