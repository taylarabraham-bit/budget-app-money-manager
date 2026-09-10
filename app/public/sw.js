// Service worker for the browser build: it shows reminder notifications (Android
// Chrome refuses new Notification() from a page) and keeps the app shell cached so
// the installed PWA opens and works with no network.
//
// The two placeholder lines below are rewritten after every `vite build` by the
// pwa-precache plugin in vite.config.ts: PRECACHE becomes the list of built files
// and BUILD a hash of them. Under `npm run dev` they stay as they are and the
// worker caches nothing, so HMR is never interfered with. A new build gets a new
// cache name, and the old one is dropped on activate.
//
// A new worker does NOT skip waiting: it takes over only once the last window of
// the previous build has closed (for an installed app, the next open). Taking over
// sooner would delete the old cache under a page that is still running the old
// build, and that page's lazy chunks (the sync transport, any React.lazy screen)
// would then 404: the server no longer has them and the cache just lost them. A
// new deploy is still picked up on the next online open, because shell() below
// is network-first and the old worker fetches the new hashed assets on a miss.
const BUILD = 'dev';
const PRECACHE = [];

const CACHE = 'money-manager-' + BUILD;
const CACHING = BUILD !== 'dev';
// How long a page load waits for the network before the cached shell is served.
const NAVIGATE_TIMEOUT_MS = 4000;
// Entries are matched by URL only. A CORS-enabled host (Vite's preview, any host
// with the `cors` package in front) answers with `Vary: Origin`; the precache
// stored those responses from requests with no Origin header, while the page's
// <script type="module" crossorigin> requests carry one, so an honoured Vary
// misses every precached asset and the offline shell renders nothing.
const MATCH = { ignoreVary: true };

const scope = () => self.registration.scope;
const inScope = (path) => new URL(path, scope()).href;

self.addEventListener('install', (event) => {
  if (CACHING) {
    // `reload` bypasses the HTTP cache so the shell stored here is the one this
    // worker was built with, not whatever the browser kept from the last build.
    const urls = [scope(), ...PRECACHE.map(inScope)].map((url) => new Request(url, { cache: 'reload' }));
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(urls)));
  }
});

self.addEventListener('activate', (event) => {
  // Safe to drop the old caches here: without skipWaiting no window of the
  // previous build can still be open when this runs.
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('money-manager-') && name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow(scope()))));
});

if (CACHING) {
  self.addEventListener('fetch', (event) => {
    const { request } = event;
    // Same-origin GETs under the app's scope only: the sync server, fonts and
    // anything else cross-origin go straight to the network, untouched.
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin || !url.href.startsWith(scope())) return;
    event.respondWith(request.mode === 'navigate' ? shell(request) : cacheFirst(event));
  });
}

// Page loads: network first (a fresh index.html picks up new builds promptly),
// the cached shell when the network is down or slow, or when the host answers
// with an error page (a 503 during an outage) although the whole app is cached.
// A 200 is always shown, so a captive portal's login page still gets through.
async function shell(request) {
  let failure;
  try {
    const response = await withTimeout(fetch(request), NAVIGATE_TIMEOUT_MS);
    if (response.ok) return response;
    failure = response;
  } catch (error) {
    failure = error;
  }
  const cache = await caches.open(CACHE);
  const cached = (await cache.match(scope(), MATCH)) || (await cache.match(inScope('index.html'), MATCH));
  if (cached) return cached;
  if (failure instanceof Response) return failure;
  throw failure;
}

// Everything else (hashed assets, icons, the manifest): the cache answers, and a
// miss is fetched and kept for next time. Opaque and error responses are never
// stored - a cached 404 would outlive the build that caused it.
async function cacheFirst(event) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, MATCH);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') event.waitUntil(cache.put(request, response.clone()));
  return response;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('network timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
