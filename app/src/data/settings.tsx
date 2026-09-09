import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { isNativeShell } from './durable';
import { STORAGE_KEYS, isRecord, readStored, writeStored } from './persist';

// Device preferences. These are about the phone or PC the app is running on,
// not the household, so they live outside the household blob and survive
// "Reset to sample data" / "Start fresh". The design system's dark theme is an
// explicit toggle (`data-theme="dark"`), never the OS setting.

export type Theme = 'light' | 'dark';

interface Settings {
  theme: Theme;
}

interface SettingsStore extends Settings {
  setTheme: (theme: Theme) => void;
}

const DEFAULTS: Settings = { theme: 'light' };

const readSettings = (x: unknown): Settings | null => (isRecord(x) && (x.theme === 'light' || x.theme === 'dark') ? { theme: x.theme } : null);

const SettingsContext = createContext<SettingsStore | null>(null);

// Resolve with the MODULE, never the plugin object (see data/durable.ts).
let statusBarPromise: Promise<typeof import('@capacitor/status-bar')> | null = null;
const statusBar = () => (statusBarPromise ??= import('@capacitor/status-bar'));

/**
 * Applies the theme to the document so the page background, native controls
 * (`color-scheme`) and the Android status bar (`theme-color`) follow it. The
 * `.bdg-app` element gets the same attribute from App for the design system.
 * In a packaged build the status bar draws over the app (edge-to-edge), so its
 * ICON colour must follow too - dark icons stayed dark over the dark theme.
 */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    const bg = getComputedStyle(root).getPropertyValue('--bdg-color-bg').trim();
    if (bg) meta.content = bg;
  }
  if (isNativeShell()) {
    void statusBar()
      .then(({ StatusBar, Style }) => StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }))
      .catch(() => {
        // status bar styling is cosmetic; never let it break theming
      });
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => readStored(STORAGE_KEYS.settings, readSettings) ?? DEFAULTS);

  useLayoutEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  const setTheme = useCallback((theme: Theme) => {
    setSettings((prev) => {
      const next = { ...prev, theme };
      writeStored(STORAGE_KEYS.settings, next);
      return next;
    });
  }, []);

  const value = useMemo<SettingsStore>(() => ({ ...settings, setTheme }), [settings, setTheme]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsStore {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
