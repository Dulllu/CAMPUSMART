// CampusMart Service Worker — minimal, enables PWA installability + push notifications
const CACHE_NAME = 'campusmart-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

// Pass-through fetch (no offline caching strategy yet — keeps things simple and avoids stale data)
self.addEventListener('fetch', (e) => {
  // Intentionally not intercepting — this app needs fresh data every time
});

// Push notification support
self.addEventListener('push', (e) => {
  let data = { title: 'CampusMart', body: 'You have a new notification' };
  try { data = e.data.json(); } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title || 'CampusMart', {
      body: data.body || '',
      icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ctext y=".9em" font-size="90"%3E%F0%9F%8E%93%3C/text%3E%3C/svg%3E',
      badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ctext y=".9em" font-size="90"%3E%F0%9F%8E%93%3C/text%3E%3C/svg%3E',
      data: data.url || '/',
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data || '/'));
});
