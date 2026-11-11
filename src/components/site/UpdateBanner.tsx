"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppVersionGate } from "@/lib/use-app-version-gate";

// "Not now" snoozes rather than dismisses: a stale page keeps failing against
// the moved-on server, so a permanent dismiss would leave dead buttons.
const SNOOZE_MS = 15 * 60_000;

// The "new version is ready" card, mounted once in the signed-in layout.
// Non-blocking: no backdrop and it takes no focus. Bottom right from md up;
// on phones it floats above the bottom tab bar. role="status" with a polite
// live region: offered, not urgent.
export function UpdateBanner() {
  const { newVersion } = useAppVersionGate();
  const [snoozedUntil, setSnoozedUntil] = useState(0);

  // Bring the card back when the snooze lapses: nothing else re-renders this
  // once the gate has latched.
  useEffect(() => {
    if (snoozedUntil === 0) return;
    const remaining = snoozedUntil - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setSnoozedUntil(0), remaining);
    return () => clearTimeout(timer);
  }, [snoozedUntil]);

  if (!newVersion || snoozedUntil !== 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[150] md:inset-x-auto md:right-4 md:bottom-4 md:max-w-sm"
    >
      <div className="flex flex-col gap-2 rounded-md border bg-card p-4 text-card-foreground shadow-lg">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <RefreshCw aria-hidden className="size-4" />
          A new version is ready
        </p>
        <p className="text-xs text-muted-foreground">
          Reload when it suits you to get the latest changes.
        </p>
        <div className="flex gap-2">
          {/* At least 44 by 44 pixels on phones, where this is tapped. */}
          <Button
            type="button"
            size="lg"
            className="min-h-11 min-w-11 md:min-h-0 md:min-w-0"
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
          <Button
            type="button"
            size="lg"
            variant="ghost"
            className="min-h-11 min-w-11 md:min-h-0 md:min-w-0"
            onClick={() => setSnoozedUntil(Date.now() + SNOOZE_MS)}
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
