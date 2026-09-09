// Minimal service worker so the app can show native notifications on Android Chrome
// (which refuses new Notification() from a page). Registered only when the user
// turns notifications on in Settings. No caching, no push handling yet.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow('/'))));
});
