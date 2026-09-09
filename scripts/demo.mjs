#!/usr/bin/env node
// Run the app live for every device on your Tailscale network - no build, no install.
//
//   npm run demo
//
// Starts the Vite dev server on this PC and puts `tailscale serve` in front of it, so a
// phone signed in to the tailnet opens http://<this-pc>.<tailnet>.ts.net/ and sees every
// code change the moment it is saved. Ctrl+C stops both; the serve config is
// foreground-only, so nothing persistent changes on this PC.
//
//   PORT=5180 npm run demo    # pin the local port (default: first free one from 5173)
//
// Vite runs inside this process, so it cannot outlive it. `tailscale serve` is a separate
// program, so it runs under a small watchdog (this same file, `--watchdog` mode) that
// kills it as soon as its stdin pipe from this process closes - which happens on a clean
// exit and on a hard kill alike - with a once-a-second parent-PID check as a backup.

import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const self = fileURLToPath(import.meta.url);
const root = path.dirname(path.dirname(self));
const tailscale =
  ['C:/Program Files/Tailscale/tailscale.exe', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'].find((p) =>
    existsSync(p),
  ) ?? 'tailscale';

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// --- watchdog mode: node demo.mjs --watchdog <parentPid> <command> [args...] -------------
if (process.argv[2] === '--watchdog') {
  const parent = Number(process.argv[3]);
  const [command, ...args] = process.argv.slice(4);
  const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  const stop = () => child.exitCode === null && child.kill();
  for (const event of ['end', 'close', 'error']) process.stdin.on(event, stop);
  process.stdin.resume();
  const timer = setInterval(() => !alive(parent) && stop(), 1000);
  child.on('exit', (code) => {
    clearInterval(timer);
    process.exit(code ?? 0);
  });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, stop);
} else {
  await main();
}

/** This PC's MagicDNS name (e.g. my-pc.tail1234.ts.net), or null when Tailscale is not up. */
async function tailnetName() {
  try {
    const { stdout } = await promisify(execFile)(tailscale, ['status', '--json']);
    const status = JSON.parse(stdout);
    if (status.BackendState !== 'Running') return null;
    return status.Self?.DNSName?.replace(/\.$/, '') || null;
  } catch {
    return null;
  }
}

async function main() {
  const { createServer } = await import('vite');
  const pinned = Number(process.env.PORT) || 0;
  const server = await createServer({
    root: path.join(root, 'app'),
    server: { host: '127.0.0.1', port: pinned || 5173, strictPort: pinned > 0 },
  });
  await server.listen();
  const port = server.httpServer.address().port;

  const serves = [];
  let shuttingDown = false;
  const shutdown = (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const stopped = serves.map(
      (s) =>
        new Promise((resolve) => {
          if (s.exitCode !== null) return resolve(undefined);
          s.once('exit', resolve);
          s.stdin.end(); // the watchdog stops tailscale and exits
          setTimeout(resolve, 3000).unref();
        }),
    );
    Promise.all([server.close(), ...stopped]).finally(() => process.exit(code));
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => shutdown(0));

  const name = await tailnetName();
  if (!name) {
    console.log(`
  On this PC:  http://127.0.0.1:${port}/
  Tailscale is not running here, so phones cannot reach it - start Tailscale, sign in,
  and run \`npm run demo\` again.
`);
    return;
  }

  // Serve the tailnet over BOTH https and http. HTTPS is the better phone experience
  // (secure context: notifications can work) and matches the laptop's Supabase, which
  // now sits behind Tailscale HTTPS itself; plain HTTP stays as the fallback for a
  // tailnet without the HTTPS certificates feature.
  const up = { https: false, http: false };
  let announced = false;
  const announce = () => {
    if (announced) return;
    announced = true;
    const phone = [up.https ? `https://${name}/` : null, up.http ? `http://${name}/` : null].filter(Boolean);
    console.log(`
  On this PC:      http://127.0.0.1:${port}/
  On your phones:  ${phone.join('  or  ') || '(tailnet serve failed - see above)'}   (any device signed in to your Tailscale)
  Ctrl+C stops everything.
`);
  };
  const spawnServe = (label, args, exitHint) => {
    const child = spawn(process.execPath, [self, '--watchdog', String(process.pid), tailscale, 'serve', ...args, `http://127.0.0.1:${port}`], { stdio: ['pipe', 'pipe', 'pipe'] });
    serves.push(child);
    child.stdout.on('data', () => {
      up[label] = true;
      if (up.https && up.http) announce();
    });
    child.stderr.on('data', (chunk) => process.stderr.write(`[tailscale ${label}] ${chunk}`));
    child.on('exit', (code) => {
      if (shuttingDown) return;
      up[label] = false;
      console.error(`[tailscale ${label}] serve stopped (exit ${code}). ${exitHint}`);
    });
    return child;
  };
  // Two foreground serves race on tailscaled's config etag when started together,
  // so http waits for the https one to settle (its stdout or exit) first.
  const https = spawnServe('https', ['--https=443'], 'If your tailnet has no HTTPS certificates yet, enable them in the Tailscale admin console - the http:// address still works meanwhile.');
  let httpStarted = false;
  const startHttp = () => {
    if (httpStarted || shuttingDown) return;
    httpStarted = true;
    spawnServe('http', ['--http=80'], 'If port 80 is held by an earlier `tailscale serve --bg`, run `tailscale serve reset` and try again.');
  };
  https.stdout.once('data', () => setTimeout(startHttp, 300));
  https.once('exit', () => setTimeout(startHttp, 300));
  setTimeout(startHttp, 5000); // whatever happens, the plain-http fallback comes up
  setTimeout(announce, 8000); // and the URLs get printed even if one side never settles
}
