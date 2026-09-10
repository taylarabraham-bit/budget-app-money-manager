import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@budget-app/ui/styles.css';
import './app.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { isNativeShell, requestPersistentStorage, restoreDurableMirror } from './data/durable';
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
  void registerOfflineShell();

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

// Installed-PWA offline shell: public/sw.js precaches the built app. Only a
// production build has anything to cache (in dev the worker's placeholders are
// unfilled and it caches nothing), and the Capacitor shell ships its own files,
// so neither registers here. Reminders register the same worker lazily; a
// second register() of one URL is a no-op. Failure just means no offline shell.
async function registerOfflineShell() {
  if (!import.meta.env.PROD || isNativeShell() || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js');
    // The browser only re-checks the worker on a full navigation; an installed
    // app is mostly resumed, so check on every return to the foreground too.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => undefined);
    });
  } catch {
    // no service worker support, blocked storage, or an install failure
  }
}

void boot();
