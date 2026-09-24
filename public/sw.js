self.addEventListener('install', (event) => {
  console.log('Service Worker Installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker Activated');
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // ปล่อย request ผ่านปกติ
});