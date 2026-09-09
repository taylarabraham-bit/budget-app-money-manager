import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Dialog, MemberChip, closeTopDialog } from '@budget-app/ui';
import { AppNav, type ScreenKey } from './components/AppNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useLogPurchase } from './components/LogPurchaseProvider';
import { isNativeShell } from './data/durable';
import { STORAGE_KEYS, isRecord, readStored, writeStored } from './data/persist';
import { useSettings } from './data/settings';
import { selectApprovals } from './data/selectors';
import { useHousehold } from './data/store';
import { useAnyRealStore } from './data/useAnyRealStore';
import { AccountsScreen } from './features/accounts';
import { BillsScreen } from './features/bills';
import { ListsScreen } from './features/lists';
import { PaydaysScreen } from './features/paydays';
import { RemindersDialog, useReminders, type ReminderTarget } from './features/reminders';
import { ReportsScreen } from './features/reports';
import { SettleScreen } from './features/settle';
import { SettingsScreen } from './features/settings';
import { OnboardingScreen } from './features/onboarding';
import { SampleBanner, WelcomeDialog } from './features/setup';
import { HOME, NavigationContext, stepBack, type Navigation, type Route } from './navigation';
import { useSync } from './sync';
import { useBrowserBack, type BackResult } from './useBrowserBack';
import { ActivityScreen } from './screens/Activity';
import { GoalsScreen } from './screens/Goals';
import { HouseholdScreen } from './screens/Household';
import { OverviewScreen } from './screens/Overview';

const welcomeShown = () => readStored(STORAGE_KEYS.welcome, (x) => (isRecord(x) ? x : null)) !== null;
const markWelcomeShown = () => writeStored(STORAGE_KEYS.welcome, { version: 1, dismissedAt: new Date().toISOString() });

export default function App() {
  const [route, setRoute] = useState<Route>(HOME);
  const [setup, setSetup] = useState<'first-run' | 'fresh' | null>(null);
  const [justSetUp, setJustSetUp] = useState(false);
  const state = useHousehold();
  const { isSample } = state;
  // Setup mode must look at EVERY store, not just the household: real bills under a
  // still-sample household ('first-run' by the household flag alone) would enter the
  // wizard unprefilled and be wiped without warning on Finish (QA UX-2). Settings'
  // "Restore the sample household" runs the same test (audit UI-14).
  const anyRealStore = useAnyRealStore();
  const setupMode: 'first-run' | 'fresh' = anyRealStore ? 'fresh' : 'first-run';
  const { theme } = useSettings();
  const sync = useSync();
  const reminders = useReminders();
  const [welcomeOpen, setWelcomeOpen] = useState(() => isSample && !welcomeShown());
  // A configured device can adopt the household on the server at boot, under
  // this sheet: "Set up my household" would then open the wipe-everything
  // wizard over a LIVE household (audit OB-1). The moment the data is real,
  // the welcome is over.
  useEffect(() => {
    if (!isSample && welcomeOpen) {
      markWelcomeShown();
      setWelcomeOpen(false);
    }
  }, [isSample, welcomeOpen]);
  // The Activity badge counts what needs the signed-in member's attention: shared purchases to confirm, and disputes on their own.
  const approvals = selectApprovals(state);
  const pendingCount = approvals.awaitingMe.length + approvals.disputedMine.length;
  const { open: openLogDialog } = useLogPurchase();
  const openLog = (kind: 'expense' | 'income' = 'expense') => openLogDialog({ kind, source: 'nav' });

  // The route, mirrored for the handlers that outlive a render (hardware Back, popstate).
  const routeRef = useRef(route);
  routeRef.current = route;

  // One Back step, for the hardware button and the browser alike (audit UI-29):
  // during the onboarding takeover the press is swallowed - the wizard has its
  // own Back, and quitting mid-setup is the one thing a stray press must not do;
  // an open dialog closes - the TOP one only, through the design system's dialog
  // stack, where a synthetic document Escape used to close a stacked pair (the
  // favourites manager AND the typed purchase under it) at once (audit UI-1);
  // a sub-screen falls back to its tab, any other tab to Overview; Overview
  // itself has nothing above it. Decided here, never inside a state updater,
  // which React may run twice (audit UI-12).
  const pressBack = useCallback((): BackResult => {
    if (document.querySelector('.app--setup')) return 'swallowed';
    if (closeTopDialog()) return 'dialog';
    const next = stepBack(routeRef.current);
    if (!next) return 'exit';
    routeRef.current = next; // a second step in the same handler sees this one before it renders
    setRoute(next);
    return 'route';
  }, []);

  // Android hardware back (packaged builds): the WebView default is "close the
  // app", which with sub-screen navigation means one reflexive back press from
  // Accounts or Settings quits. Instead it steps the way the on-screen Back
  // does, and only Overview itself exits.
  useEffect(() => {
    if (!isNativeShell()) return;
    let removed = false;
    let handle: { remove: () => Promise<void> } | undefined;
    void import('@capacitor/app').then(async (m) => {
      const h = await m.App.addListener('backButton', () => {
        if (pressBack() === 'exit') void m.App.exitApp();
      });
      if (removed) void h.remove();
      else handle = h;
    });
    return () => {
      removed = true;
      void handle?.remove();
    };
  }, [pressBack]);

  // Outside the APK the same step rides on the browser's history, so the system
  // Back in Chrome steps instead of leaving the site (audit UI-29).
  useBrowserBack(route, pressBack);

  // Screens swap inside one main element and the window kept its scroll, so
  // Goals opened mid-page after a long Activity month (audit UI-8). Tab and
  // sub-screen changes start at the top; param-only ones (a reminder
  // re-opening Activity's pending tab) stay put.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.tab, route.sub?.name]);

  // Tabs come from the nav; a tab can carry one sub-screen (Settings). Tapping a tab clears it.
  const screen = route.tab;
  const setScreen = (tab: ScreenKey) => setRoute({ tab });
  const navigation = useMemo<Navigation>(
    () => ({ route, go: setRoute, openSettings: () => setRoute((r) => ({ tab: r.tab, sub: { name: 'settings' } })) }),
    [route],
  );
  const dark = theme === 'dark' ? 'dark' : undefined;
  const navigateFromReminder = (target: ReminderTarget) =>
    target.kind === 'route'
      ? // The nonce makes a second tap on an identical reminder route re-apply its params (QA UX-6).
        setRoute({ ...target.route, params: { ...target.route.params, at: Date.now() } })
      : openLogDialog({ kind: target.log, source: 'reminder' });

  const startSetup = (mode: 'first-run' | 'fresh') => {
    markWelcomeShown();
    setWelcomeOpen(false);
    setSetup(mode);
  };

  // Onboarding replaces the whole shell (no nav, no log dialog).
  if (setup) {
    return (
      <div className="bdg-app app app--setup" data-theme={dark}>
        <OnboardingScreen
          mode={setup}
          onDone={() => {
            setSetup(null);
            setRoute(HOME);
            setJustSetUp(true);
          }}
          onCancel={() => setSetup(null)}
        />
      </div>
    );
  }

  let content;
  if (route.sub?.name === 'report') {
    content = <ReportsScreen initialMonth={route.sub.month} initialMemberId={route.sub.memberId} onBack={() => setRoute({ tab: screen })} onLogPurchase={() => openLog('expense')} />;
  } else if (route.sub?.name === 'lists') {
    content = <ListsScreen initialList={route.sub.list} onBack={() => setRoute({ tab: screen })} onOpenGoals={() => setScreen('goals')} />;
  } else if (route.sub?.name === 'paydays') {
    content = <PaydaysScreen onBack={() => setRoute({ tab: 'bills' })} />;
  } else if (route.sub?.name === 'accounts') {
    content = <AccountsScreen onBack={() => setRoute({ tab: screen })} />;
  } else if (route.sub?.name === 'settle') {
    content = <SettleScreen onBack={() => setRoute({ tab: screen })} />;
  } else if (route.sub?.name === 'settings') {
    content = <SettingsScreen onBack={() => setRoute({ tab: screen })} onStartFresh={() => startSetup(setupMode)} onOpenHousehold={() => setScreen('household')} />;
  } else if (screen === 'overview') {
    content = (
      <OverviewScreen
        onLogPurchase={() => openLog('expense')}
        onLogEarnings={() => openLog('income')}
        onOpenActivity={() => setScreen('activity')}
        onOpenBills={() => setScreen('bills')}
        onOpenGoals={() => setScreen('goals')}
        onOpenHousehold={() => setScreen('household')}
        onOpenSettle={() => setRoute({ tab: 'overview', sub: { name: 'settle' } })}
        onOpenPaydays={() => setRoute({ tab: 'bills', sub: { name: 'paydays' } })}
        onOpenAccounts={() => setRoute({ tab: 'overview', sub: { name: 'accounts' } })}
        onOpenLists={(list) => setRoute({ tab: 'overview', sub: { name: 'lists', list } })}
        onOpenReport={(memberId) => setRoute({ tab: 'overview', sub: { name: 'report', memberId } })}
        onNavigate={navigateFromReminder}
      />
    );
  } else if (screen === 'activity') {
    content = <ActivityScreen onLogPurchase={() => openLog('expense')} initialKind={route.params?.kind} navNonce={route.params?.at} />;
  } else if (screen === 'goals') {
    content = <GoalsScreen />;
  } else if (screen === 'bills') {
    content = <BillsScreen onOpenPaydays={() => setRoute({ tab: 'bills', sub: { name: 'paydays' } })} />;
  } else {
    content = <HouseholdScreen onOpenActivity={() => setScreen('activity')} />;
  }

  return (
    <NavigationContext.Provider value={navigation}>
      <div className="bdg-app app" data-theme={dark}>
        <AppNav screen={screen} onChange={setScreen} onLogPurchase={() => openLog('expense')} onOpenSettings={navigation.openSettings} pendingCount={pendingCount} />
        <main className="app-main">
          {/* Every store's failed write (quota, private mode) surfaces here, on every
              screen: the banner lived only on Settings while purchases logged on
              Overview silently stayed in memory (audit SYN-7). Settings keeps the
              detailed one with the export action. */}
          {state.storageError && route.sub?.name !== 'settings' && (
            <Alert
              tone="danger"
              title="Changes aren't being saved"
              className="sample-banner"
              action={
                <Button variant="ghost" size="sm" onClick={navigation.openSettings}>
                  Settings
                </Button>
              }
            >
              Storage on this device is full or blocked, so what you change now lives only in memory. Export a backup from Settings so nothing is lost.
            </Alert>
          )}
          {isSample && !route.sub && <SampleBanner onSetUp={() => startSetup(setupMode)} />}
          {justSetUp && !route.sub && (
            <Alert
              tone="success"
              title="You're all set"
              className="sample-banner"
              action={
                <Button size="sm" onClick={() => { setJustSetUp(false); openLog('expense'); }}>
                  Log a purchase
                </Button>
              }
              onDismiss={() => setJustSetUp(false)}
            >
              Paydays, bills and budgets are in place. Everything can be changed later from the Household tab and Settings.
            </Alert>
          )}
          {/* A crash on one screen keeps the nav and the other tabs; the boundary clears when the route changes (audit UI-7). */}
          <ErrorBoundary scope="screen" resetKey={`${route.tab}/${route.sub?.name ?? ''}`} onReset={() => setRoute(HOME)}>
            {content}
          </ErrorBoundary>
        </main>
        <ErrorBoundary scope="dialog" onReset={reminders.closeDialog}>
          <RemindersDialog onNavigate={navigateFromReminder} />
        </ErrorBoundary>
        {/* The same question the join wizard asks, for a device that adopted the
            household on its own (audit OB-1). Not dismissable: until answered,
            every purchase would be logged as members[0] - the partner. */}
        <Dialog open={sync.needsIdentity} title="Which of you is this phone?" description="This phone picked up your household from the home server. New purchases are logged as you - it can be changed any time in Settings.">
          <div className="bdg-row bdg-wrap bdg-gap-2">
            {state.members.map((m) => (
              <MemberChip
                key={m.id}
                name={m.name}
                color={m.color}
                meta={m.role}
                onSelect={() => {
                  state.setCurrentMember(m.id);
                  sync.identityChosen();
                }}
              />
            ))}
          </div>
        </Dialog>
        <ErrorBoundary
          scope="dialog"
          onReset={() => {
            markWelcomeShown();
            setWelcomeOpen(false);
          }}
        >
          <WelcomeDialog
            open={welcomeOpen}
            onExplore={() => {
              markWelcomeShown();
              setWelcomeOpen(false);
            }}
            onSetUp={() => startSetup(setupMode)}
          />
        </ErrorBoundary>
      </div>
    </NavigationContext.Provider>
  );
}
