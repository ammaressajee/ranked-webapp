importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC65O61DInPiqg0TprXmKB5-esyrSY-t0k",
  authDomain: "ranked-app-9f746.firebaseapp.com",
  projectId: "ranked-app-9f746",
  storageBucket: "ranked-app-9f746.firebasestorage.app",
  messagingSenderId: "353112881183",
  appId: "1:353112881183:web:ad6ced2745ab7a222bbd2a",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'Ladders';
  const body = payload.notification?.body ?? 'You have an update';
  self.registration.showNotification(title, {
    body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: payload.data
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
