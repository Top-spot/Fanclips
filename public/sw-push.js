// Custom push notification handler (works alongside vite-plugin-pwa service worker)
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const title = data.title || "FanCam";
  const options = {
    body: data.body || "You have a new notification",
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
    tag: data.tag || "fancam-notification",
    data: { url: data.url || "/" },
    vibrate: [100, 50, 100],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
