const CACHE_NAME = 'malveon-tasks-v6';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './app.js',
  './style.css',
  './malveon-icon-192.png',
  './malveon-icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Network-first for API calls (Supabase, external); cache-first for local assets
  if (url.origin !== self.location.origin) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request))
    );
  }
});

// Handle notification messages sent from the app (mobile fallback)
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SHOW_NOTIFICATION') {
    const title = e.data.title || 'Malveon Tasks';
    const body = e.data.body || '';
    e.waitUntil(
      self.registration.showNotification(title, {
        body: body,
        icon: './malveon-icon-192.png',
        badge: './malveon-icon-192.png',
        tag: 'malveon-' + Date.now(),
        requireInteraction: false
      })
    );
  }
});

// Open the app when a notification is clicked
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ((client.url.includes('malveon-tasks') || client.url.includes('index.html') || client.url.endsWith('/')) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./');
      }
    })
  );
});
