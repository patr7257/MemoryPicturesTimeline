"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Send, Share } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  currentSupport,
  disablePush,
  enablePush,
  reconcile,
  type PushState,
} from "@/lib/push/client";
import type { PushSupport } from "@/lib/push/client-decisions";
import {
  NOTIFICATION_TYPE_KEYS,
  NOTIFICATION_TYPES,
  type NotificationType,
} from "@/lib/push/registry";

type Prefs = Record<NotificationType, boolean>;

export function PushSettings() {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [state, setState] = useState<PushState>("off");
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupport(currentSupport());
    void reconcile().then(setState).catch(() => {});
    void fetch("/api/push/prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { prefs: Prefs } | null) => d && setPrefs(d.prefs))
      .catch(() => {});
  }, []);

  // Runs from the click so the permission prompt keeps its user gesture.
  async function turnOn() {
    setBusy(true);
    try {
      const next = await enablePush();
      setState(next);
      if (next === "denied") toast.error("Notifications are blocked in your device settings.");
      if (next === "not-configured") toast.error("Push is not configured on the server yet.");
    } catch {
      toast.error("Could not switch notifications on.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    await disablePush();
    setState("off");
    setBusy(false);
  }

  async function toggle(type: NotificationType, enabled: boolean) {
    const before = prefs;
    setPrefs((p) => (p ? { ...p, [type]: enabled } : p));
    const res = await fetch("/api/push/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [type]: enabled }),
    }).catch(() => null);
    if (res?.ok) {
      setPrefs(((await res.json()) as { prefs: Prefs }).prefs);
    } else {
      setPrefs(before);
      toast.error("Could not save.");
    }
  }

  async function sendTest() {
    const res = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
    if (res?.ok) toast.success("Test sent. It should arrive in a moment.");
    else toast.error("Test not sent (push may be disabled in this environment).");
  }

  if (support === null) return null;

  if (support === "ios-needs-install") {
    return (
      <div className="rounded-lg border bg-card p-5 text-sm">
        <p className="font-medium">Install the app first</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Tap <Share className="inline size-4" aria-label="Share" /> in Safari.
          </li>
          <li>Choose &quot;Add to Home Screen&quot;.</li>
          <li>Open Memories from the Home Screen and switch notifications on here.</li>
        </ol>
      </div>
    );
  }
  if (support === "unsupported") {
    return <p className="text-sm text-muted-foreground">This browser cannot receive notifications.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        {state === "on" ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-sm">
              <Bell className="size-4" /> Notifications are on for this device
            </span>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void turnOff()}>
              <BellOff data-slot="icon" />
              Switch off
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void sendTest()}>
              <Send data-slot="icon" />
              Send test
            </Button>
          </>
        ) : (
          <>
            <Button disabled={busy || state === "denied"} onClick={() => void turnOn()}>
              <Bell data-slot="icon" />
              Switch notifications on
            </Button>
            {state === "denied" && (
              <p className="text-sm text-muted-foreground">
                Blocked. Allow notifications for Memories in your device settings, then come back.
              </p>
            )}
            {state === "not-configured" && (
              <p className="text-sm text-muted-foreground">Push is not configured on the server yet.</p>
            )}
          </>
        )}
      </div>

      <ul className="flex flex-col gap-3">
        {NOTIFICATION_TYPE_KEYS.map((type) => {
          const def = NOTIFICATION_TYPES[type];
          return (
            <li key={type} className="flex items-start gap-3">
              <input
                id={`pref-${type}`}
                type="checkbox"
                className="mt-1 size-5 accent-primary"
                checked={prefs ? prefs[type] : true}
                disabled={!prefs || !def.userCanDisable}
                onChange={(e) => void toggle(type, e.target.checked)}
              />
              <label htmlFor={`pref-${type}`} className="flex flex-col">
                <span className="font-medium">{def.label}</span>
                <span className="text-sm text-muted-foreground">{def.description}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
