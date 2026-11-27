// MineSafe IoT (Build P094) - Service Worker Self-Unregister & Cache Cleaner
// Elimina de forma permanente service workers y cachés antiguos para asegurar carga del bundle P094 en GitHub Pages.
const SW_CLEANUP_VERSION = 'minesafe-p094';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => {
      return self.registration.unregister();
    }).then(() => {
      return self.clients.matchAll();
    }).then((clients) => {
      clients.forEach((client) => {
        if (client.url && 'navigate' in client) {
          client.navigate(client.url);
        }
      });
    })
  );
});
