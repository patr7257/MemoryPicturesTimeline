// Pure client-side decisions, kept out of components so they are unit tested.
export type TeardownReason = "signed-out" | "lapsed" | "unauthorized";

// Only a deliberate sign-out removes the subscription.
export const shouldTearDownSubscription = (reason: TeardownReason) => reason === "signed-out";

// Open-redirect guard for the notification deep link: root-relative only.
export function safePath(url: unknown): string | null {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) return null;
  if (url.includes("\\")) return null;
  return url;
}

export type PushEnv = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
};

export type PushSupport = "supported" | "ios-needs-install" | "unsupported";

export function pushSupport(env: PushEnv): PushSupport {
  const isIos =
    /iphone|ipad|ipod/i.test(env.userAgent) ||
    (env.platform === "MacIntel" && env.maxTouchPoints > 1);
  if (isIos && !env.standalone) return "ios-needs-install";
  return env.hasServiceWorker && env.hasPushManager ? "supported" : "unsupported";
}

// base64url VAPID public key to the bytes pushManager.subscribe wants.
export function urlBase64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
