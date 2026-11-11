"use client";

import { useEffect, useRef, useState } from "react";

import { isNewBuild, normaliseSha, servedBuildSha } from "@/lib/build-id";
import {
  hasDirtyInput,
  hasOpenModal,
  hasUnsavedWork,
  isSafeToAutoReload,
} from "@/lib/stale-bundle";

// Background poll while the page is visible. Cheap: one small GET.
const POLL_MS = 5 * 60_000;
// Never check more often than this, whatever triggered it (refocus bursts).
const MIN_GAP_MS = 60_000;
// Settle time after the page goes hidden before an automatic reload.
const HIDDEN_SETTLE_MS = 3_000;

// The commit this bundle was built from. Written out in full because Next
// only inlines a `process.env.NEXT_PUBLIC_*` it sees literally. Null for an
// unstamped build (local dev), which switches the gate off.
const RUNNING_SHA = normaliseSha(process.env.NEXT_PUBLIC_COMMIT_SHA);

// Detects that a newer build is live than the one this page runs, and does
// the narrow, safe automatic reload. Ported from the app-shell block of
// zrm-fullstack-building-blocks.
//
// A Home Screen app stays open for days and keeps running the bundle it
// loaded, against a server that has moved on: a server action from the old
// build no longer exists, so a button silently does nothing. The page checks
// its own origin on becoming visible, on focus, on coming back online and on
// a slow poll. The push service worker (public/sw.js) caches nothing, so a
// page reload is all an update needs.
export function useAppVersionGate(): { newVersion: boolean } {
  const [newVersion, setNewVersion] = useState(false);
  const lastCheck = useRef(0);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const running = RUNNING_SHA;
    if (!running) return;

    let stopped = false;

    async function check(force = false) {
      if (stopped) return;
      if (document.visibilityState !== "visible" && !force) return;
      const now = Date.now();
      if (now - lastCheck.current < MIN_GAP_MS) return;
      lastCheck.current = now;
      const served = await servedBuildSha();
      if (stopped || !isNewBuild(running, served)) return;
      // A new build has shipped and that cannot un-ship: stop checking.
      stopped = true;
      setNewVersion(true);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onFocus = () => void check();
    // The offline gap that just ended is exactly when a deploy went unnoticed.
    const onOnline = () => void check(true);
    const interval = setInterval(() => void check(), POLL_MS);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    void check();

    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // The automatic reload: only once a new version is confirmed, and only
  // while the page is hidden, the one moment a reload interrupts nothing.
  useEffect(() => {
    if (!newVersion) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function consider() {
      if (document.visibilityState !== "hidden") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (
          isSafeToAutoReload({
            hidden: document.visibilityState === "hidden",
            modalOpen: hasOpenModal(document),
            dirtyInput: hasDirtyInput(document),
            unsavedWork: hasUnsavedWork(document),
          })
        ) {
          window.location.reload();
        }
      }, HIDDEN_SETTLE_MS);
    }

    document.addEventListener("visibilitychange", consider);
    // The page may already be hidden when the new version is confirmed.
    consider();
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", consider);
    };
  }, [newVersion]);

  return { newVersion };
}
