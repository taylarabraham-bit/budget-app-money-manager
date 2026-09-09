import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The app consumes the design system straight from ../src so library edits
// hot-reload here; the published package (dist/) is what other consumers get.
const ui = (p: string) => fileURLToPath(new URL(`../src/${p}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@budget-app/ui/styles.css', replacement: ui('styles/index.css') },
      { find: '@budget-app/ui', replacement: ui('index.ts') },
    ],
    dedupe: ['react', 'react-dom'],
  },
  // The dev server is also reachable on the tailnet through `tailscale serve`
  // (http://<pc>.<tailnet>.ts.net, printed by scripts/demo.mjs) so phones can run the app live with no build;
  // Vite rejects unknown Host headers unless the MagicDNS domain is allowed.
  server: { open: false, allowedHosts: ['.ts.net'] },
});
