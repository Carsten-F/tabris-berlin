// Team Nusatani service worker: offline app shell, push messages, notification clicks
const VERSION = 'tn-v1.0.0';
const SHELL = [
  './', 'index.html', 'css/app.css', 'config.js', 'manifest.webmanifest',
  'vendor/supabase-2.118.0.js', 'vendor/purify-3.4.17.min.js',
  'js/app.js', 'js/i18n.js', 'js/util.js', 'js/editor.js', 'js/store.js', 'js/notify.js', 'js/pwa.js',
  'js/views/common.js', 'js/views/home.js', 'js/views/tasks.js', 'js/views/decisions.js', 'js/views/meetings.js',
  'js/views/minutes.js', 'js/views/updates.js', 'js/views/documents.js', 'js/views/team.js', 'js/views/settings.js',
  'js/views/search.js', 'icons/icon-192.png', 'icons/badge-96.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Same-origin GET: network first (always fresh), cache as fallback when offline.
// API calls to Supabase are never cached.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: 'Team Nusatani', body: e.data && e.data.text() }; }
  const title = data.title || 'Team Nusatani';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '#/home' },
  }).then(() => (self.navigator && self.navigator.setAppBadge && data.badge ? self.navigator.setAppBadge(data.badge) : null)).catch(() => {}));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.url) || '#/home';
  const target = new URL(self.registration.scope).origin + '/' + (hash.startsWith('#') ? hash : '#' + hash);
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    for (const w of wins) {
      if (new URL(w.url).origin === new URL(target).origin) {
        w.postMessage({ type: 'navigate', url: hash });
        return w.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
