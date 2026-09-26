self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { /* ignore */ }
  const tag = "call-" + (d.roomId || "x");
  if (d.type === "cancel") {
    event.waitUntil(self.registration.getNotifications({ tag }).then((ns) => ns.forEach((n) => n.close())));
    return;
  }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // If the app is open and visible, the in-app ringing screen handles it.
    if (wins.some((w) => w.visibilityState === "visible")) return;
    await self.registration.showNotification(`Incoming ${d.video ? "video" : "voice"} call`, {
      body: `${d.fromName || "Someone"} is calling you — tap to answer`,
      icon: "/favicon.png",
      badge: "/favicon.png",
      tag,
      renotify: true,
      requireInteraction: true,
      vibrate: [600, 300, 600, 300, 600, 300, 600, 300, 600],
      data: d,
      actions: [{ action: "answer", title: "Answer" }, { action: "decline", title: "Decline" }],
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  const d = event.notification.data || {};
  event.notification.close();
  if (event.action === "decline") return;
  const q = new URLSearchParams({ call: d.roomId || "", from: d.from || "", name: d.fromName || "", video: d.video ? "1" : "0" });
  const target = "/?" + q.toString();
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      w.postMessage({ type: "incoming-call", ...d });
      if ("focus" in w) return w.focus();
    }
    return self.clients.openWindow(target);
  })());
});
