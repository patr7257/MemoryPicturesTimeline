"use client";

// "Share map": builds a PNG in the browser (the map with visited countries
// only, a first name and three count lines) and hands it to the share sheet,
// or downloads it where the browser cannot share files. Nothing is uploaded.
// Imports nothing from the map library: it works on the canvas the map's
// capture hands back.
import { useEffect, useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { CountryStats } from "@/lib/countries";
import type { MapFills } from "@/lib/country-map-style";
import { composeShareImage, shareFileName, shareFills, type ShareSubject } from "@/lib/share-map-image";

import type { MapCapture } from "./CountriesMap";

// No spinner for work that ends under the flash threshold (frontend-ui-patterns STA-01).
const SPINNER_DELAY_MS = 300;
// Long enough for every browser to start the download before the URL goes.
const REVOKE_DELAY_MS = 10_000;
const FAILED = "Could not make the image";

const isNamed = (err: unknown, name: string) =>
  typeof err === "object" && err !== null && (err as { name?: unknown }).name === name;

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

export function ShareMapButton({
  mapRef,
  fills,
  subject,
  stats,
  ready,
}: {
  mapRef: React.RefObject<MapCapture | null>;
  // The fills on screen; only the visited ones reach the image (shareFills).
  fills: MapFills;
  subject: ShareSubject;
  stats: CountryStats;
  // False until the map and its shapes are in: there is nothing to capture.
  ready: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!busy) return;
    const t = window.setTimeout(() => setSlow(true), SPINNER_DELAY_MS);
    return () => {
      window.clearTimeout(t);
      setSlow(false);
    };
  }, [busy]);

  async function share() {
    if (busy || !ready) return;
    setBusy(true);
    try {
      const map = mapRef.current;
      if (!map) throw new Error("The map is not ready");
      const canvas = await map.capture(shareFills(fills));
      const blob = await composeShareImage(canvas, subject, stats);
      const file = new File([blob], shareFileName(subject), { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch (err) {
          // The sheet needs a fresh tap; when building the image used that
          // up, the download still gives the person their image.
          if (isNamed(err, "NotAllowedError")) download(file);
          else throw err;
        }
      } else {
        download(file);
      }
    } catch (err) {
      // A cancelled share sheet is the person's choice, not a failure.
      // Errors stay until dismissed (frontend-ui-patterns CMP-02).
      if (!isNamed(err, "AbortError")) toast.error(FAILED, { duration: Infinity, closeButton: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={share}
      disabled={busy || !ready}
      aria-busy={busy}
      className="h-11 self-end md:h-8"
    >
      {slow ? <Loader2 aria-hidden className="animate-spin" /> : <Share2 aria-hidden />}
      Share map
    </Button>
  );
}
