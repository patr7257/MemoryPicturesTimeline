"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { postSubscription, reconcile } from "@/lib/push/client";
import { safePath } from "@/lib/push/client-decisions";

// Mounted once in the root layout. Routes notification taps inside the page
// (navigate() is a no-op in an installed iOS PWA), relays subscription
// rotation from the worker, and heals the subscription on focus. Never prompts.
export function PushBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const signedOutPage = pathname === "/login";

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: unknown; subscription?: PushSubscriptionJSON };
      if (data?.type === "notification-click") {
        const path = safePath(data.url);
        // Ack before routing so the worker does not time out and navigate again.
        event.ports[0]?.postMessage({ handled: path !== null });
        if (path) router.push(path as never);
      } else if (data?.type === "push-subscription-changed" && data.subscription) {
        void postSubscription(data.subscription).catch(() => {});
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  useEffect(() => {
    if (signedOutPage) return;
    const run = () => {
      if (document.visibilityState === "visible") void reconcile().catch(() => {});
    };
    run();
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    return () => {
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
    };
  }, [signedOutPage]);

  return null;
}
