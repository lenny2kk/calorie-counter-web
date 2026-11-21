/* Service worker CalorieCounter – odbiera powiadomienia push (Firebase Cloud Messaging)
 * i pokazuje je także wtedy, gdy aplikacja jest zamknięta. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Serwer wysyła wiadomości „data-only”, więc to my decydujemy, jak wygląda powiadomienie.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { data: { body: event.data && event.data.text() } };
  }
  const data = payload.data || payload.notification || {};
  const title = data.title || 'CalorieCounter';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: data.tag || 'calorie-counter',
    renotify: true,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Kliknięcie: przełącz na otwartą kartę aplikacji albo otwórz nową
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});
