// Culture Co. Desk service worker: lets Desk open with no signal and shows notifications.
// When you change desk.html, bump VERSION (v2, v3...) so phones pick up the new copy.
const VERSION = 'cc-desk-v1';

const SHELL = [
  'desk.html',
  'desk.webmanifest',
  'img/icon-192.png',
  'img/icon-512.png',
  'img/mark.png',
  'img/logo.png',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { mode: u.startsWith('http') ? 'no-cors' : 'same-origin' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Firebase data and sign-in traffic is never cached here; Firestore keeps its own offline copy and syncs it.
const SKIP = /firestore\.googleapis|googleapis\.com\/identitytoolkit|securetoken|firebaseapp\.com|firebaseinstallations|fcmregistrations|apis\.google\.com|accounts\.google/;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || SKIP.test(req.url)) return;
  const url = new URL(req.url);

  // Pages: newest copy when online, saved copy when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { if (res.ok) { const c = res.clone(); caches.open(VERSION).then((x) => x.put(req, c)); } return res; })
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then((r) => r || (url.pathname.endsWith('desk.html') ? caches.match('desk.html') : Response.error())))
    );
    return;
  }

  // Scripts, fonts, images: saved copy right away, refreshed in the background.
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !/gstatic\.com|fonts\.googleapis\.com/.test(url.hostname)) return;
  e.respondWith(
    caches.open(VERSION).then((c) =>
      c.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; })
          .catch(() => hit);
        return hit || net;
      })
    )
  );
});

// Tapping a notification opens Desk (or brings it to the front).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || 'desk.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const w = wins.find((x) => x.url.includes('desk.html'));
      if (w) return w.focus();
      return self.clients.openWindow(target);
    })
  );
});

// Ready for closed-app push later (Firebase Cloud Messaging sends a "push" event here).
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { notification: { title: 'Culture Co. Desk', body: e.data && e.data.text() } }; }
  const n = d.notification || d.data || {};
  e.waitUntil(self.registration.showNotification(n.title || 'Culture Co. Desk', {
    body: n.body || '', icon: 'img/icon-192.png', badge: 'img/icon-192.png', tag: n.tag, data: { url: n.url || 'desk.html#reserve' }
  }));
});
