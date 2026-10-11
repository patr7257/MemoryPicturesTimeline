/* global self, clients */
// Push-only service worker. No fetch handler and no caching on purpose: photos
// are auth-gated and the app must never serve a stale release. Path /sw.js is
// permanent (a renamed worker would stay registered on every phone) and is
// served with Cache-Control: no-cache (next.config.ts).

// Without these two a new worker on a Home Screen app waits until every window
// closes, which can be weeks.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Memories", {
      body: payload.body,
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      icon: payload.icon || "/icons/icon-192.png",
      badge: payload.badge || "/icons/badge-96.png",
      data: { url: payload.url || "/" },
    }),
  );
});

// WindowClient.navigate() is a no-op in an installed iOS PWA, so ask the open
// page to route itself and fall back to navigate() only if no page answers.
const ROUTE_ACK_TIMEOUT_MS = 500;

function askClientToRoute(client, url) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), ROUTE_ACK_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data && event.data.handled === true);
    };
    try {
      client.postMessage({ type: "notification-click", url }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
      const existing = list.find((c) => "focus" in c);
      if (existing) {
        const focused = await existing.focus();
        if (await askClientToRoute(focused, url)) return focused;
        if ("navigate" in focused) {
          try {
            await focused.navigate(url);
          } catch {
            // the window is focused, which matters most
          }
        }
        return focused;
      }
      return clients.openWindow ? clients.openWindow(url) : undefined;
    }),
  );
});

// The browser can rotate a subscription without loading the app. Re-subscribe
// and hand the new one to any open page (the worker has no session to call the
// API itself). With no page open, the next app load's reconcile re-posts it.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const key =
        (event.newSubscription && event.newSubscription.options.applicationServerKey) ||
        (event.oldSubscription && event.oldSubscription.options.applicationServerKey) ||
        null;
      let sub = event.newSubscription || null;
      if (!sub && key) {
        try {
          sub = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          });
        } catch (err) {
          console.error("[sw] re-subscribe failed", err);
          return;
        }
      }
      if (!sub) return;
      const json = sub.toJSON();
      for (const c of await clients.matchAll({ type: "window", includeUncontrolled: true })) {
        c.postMessage({ type: "push-subscription-changed", subscription: json });
      }
    })(),
  );
});
