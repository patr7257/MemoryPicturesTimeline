// Browser-side push plumbing (no React). Subscribing is per device; the server
// upserts by endpoint. Permission is only ever requested from enablePush(),
// which must be called from a click handler.
import { pushSupport, urlBase64ToBytes, type PushSupport } from "./client-decisions";

export function currentSupport(): PushSupport {
  const nav = navigator as Navigator & { standalone?: boolean };
  return pushSupport({
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    standalone:
      window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window && "Notification" in window,
  });
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

let cachedKey: string | null = null;
async function vapidKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  const res = await fetch("/api/push/vapid");
  if (!res.ok) throw new Error(`vapid ${res.status}`);
  const { publicKey } = (await res.json()) as { publicKey: string };
  cachedKey = publicKey;
  return publicKey;
}

// POST with a small retry (3 attempts, 500 ms x attempt). A 401 is not retried
// and never tears anything down (session lapse is not a sign-out).
export async function postSubscription(sub: PushSubscriptionJSON): Promise<boolean> {
  const { endpoint, keys } = sub;
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error("incomplete subscription");
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, keys }),
      });
      if (res.ok) return true;
      if (res.status === 401 || res.status === 400) return false;
    } catch {
      // network blip, retry
    }
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  return false;
}

export type PushState = "on" | "off" | "denied" | "not-configured";

// Never prompts. Heals a granted-but-unsubscribed device silently and re-posts
// the current subscription (idempotent upsert, re-keys a shared device).
let inflight: Promise<PushState> | null = null;
export function reconcile(): Promise<PushState> {
  inflight ??= doReconcile().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doReconcile(): Promise<PushState> {
  if (currentSupport() !== "supported") return "off";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  const key = await vapidKey().catch(() => "");
  if (!key) return "not-configured";
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(key),
    }));
  return (await postSubscription(sub.toJSON())) ? "on" : "off";
}

// Click handler only: the permission prompt needs the user gesture.
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";
  return reconcile();
}

// Deliberate sign-out or switching off: remove server row and browser subscription.
export async function disablePush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
