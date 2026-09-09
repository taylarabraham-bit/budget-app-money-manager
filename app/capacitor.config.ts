import type { CapacitorConfig } from '@capacitor/cli';

// The packaged (Android) build. The web build in dist-android/ is the app;
// this wraps it. Build order: `npm run app:build:android` (bakes app/.env.local,
// so the APK auto-connects to the home Supabase - the tailnet is the lock),
// then `npx cap sync android` and Gradle. dist-android/ is separate from dist/
// on purpose: dist/ holds the env-STRIPPED test build that live QA serves, and
// an APK build must never swap the real server URL underneath a running test.
const config: CapacitorConfig = {
  appId: 'com.tayla.moneymanager',
  appName: 'Money Manager',
  webDir: 'dist-android',
  // Deliberately NOT setting android.webContentsDebuggingEnabled: Capacitor's
  // default is true for debug builds (the CDP-over-USB QA technique relies on
  // it) and false for release builds (audit SEC-1 - the phones run release).
  // Pinning it either way would break one of those two.
  plugins: {
    LocalNotifications: {
      // Status-bar glyph for reminders (audit INF-13): without one Android shows
      // its generic "i" dialog icon. Must be a white-on-transparent drawable.
      smallIcon: 'ic_stat_notify',
      iconColor: '#0f766e',
    },
  },
};

export default config;
