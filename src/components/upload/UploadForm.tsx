"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { unstable_isUnrecognizedActionError, useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Loader2, RotateCw, Upload } from "lucide-react";
import { toast } from "sonner";

import { createTrip } from "@/actions/trips";
import { parseExif, type ClientExif } from "@/lib/exif-client";
import type { PersonRef } from "@/lib/queries";
import {
  MAX_REPORTS_PER_BATCH,
  UploadTimeoutError,
  batchToast,
  describeFailure,
  uploadHint,
  withTimeout,
  type ClientReport,
  type UploadStage,
} from "@/lib/upload-client";
import { draftError, emptyDraft } from "@/lib/vacations-view";
import { VacationFields } from "@/components/vacations/VacationFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TripOption = { id: string; title: string; startDate: string };

type FileState = {
  file: File;
  status: "queued" | "uploading" | "processing" | "done" | "error";
  message?: string;
  // The session ran out: the row links to the sign-in page.
  signIn?: boolean;
  // Kept across retries so finalize stays idempotent.
  photoId?: string;
  key?: string;
  exif?: ClientExif;
};

const CONCURRENCY = 3;

// False in the server-rendered HTML, true once this component's script runs.
// A page whose script never started keeps showing the "still loading" hint.
const noopSubscribe = () => () => {};
function useScriptReady(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

async function serverError(res: Response): Promise<string | null> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? null;
}

export function UploadForm({
  trips,
  people,
  viewerPersonId,
}: {
  trips: TripOption[];
  people: PersonRef[];
  viewerPersonId: string | null;
}) {
  const router = useRouter();
  const ready = useScriptReady();
  const [tripId, setTripId] = useState<string>(trips[0]?.id ?? "new");
  const [draft, setDraft] = useState(() => emptyDraft(viewerPersonId));
  // The vacation created during this upload, so the select can show it.
  const [created, setCreated] = useState<TripOption | null>(null);
  const [files, setFiles] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);
  // The photo picker is open and has not handed photos back yet. On iPhone
  // the picker converts every photo before anything arrives, which can take
  // a while for a big selection.
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reportsLeft = useRef(MAX_REPORTS_PER_BATCH);

  // Closing the picker without choosing fires "cancel" (no change event).
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onCancel = () => setPickerOpen(false);
    input.addEventListener("cancel", onCancel);
    return () => input.removeEventListener("cancel", onCancel);
  }, []);

  // Best effort: one log line on the server per failure, capped per batch.
  function report(r: ClientReport) {
    if (reportsLeft.current <= 0) return;
    reportsLeft.current -= 1;
    void fetch("/api/upload/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(r),
      keepalive: true,
    }).catch(() => {});
  }

  function onPick(list: FileList | null) {
    setPickerOpen(false);
    if (!list) return;
    const next = Array.from(list).map<FileState>((file) => ({
      file,
      status: "queued",
    }));
    setFiles((prev) => [...prev, ...next]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function patchFile(index: number, patch: Partial<FileState>) {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  async function ensureTrip(): Promise<string | null> {
    if (tripId !== "new") return tripId;
    const problem = draftError(draft);
    if (problem) {
      toast.error(problem);
      return null;
    }
    try {
      const { id } = await withTimeout("create-trip", () =>
        createTrip({
          title: draft.title,
          startDate: draft.startDate,
          endDate: draft.endDate || null,
          locationName: draft.locationName || null,
          description: draft.description || null,
          personIds: draft.personIds,
        }),
      );
      setCreated({ id, title: draft.title.trim(), startDate: draft.startDate });
      setTripId(id);
      return id;
    } catch (err) {
      // A page from before the latest deploy calls an action that no longer
      // exists on the server: only a reload fixes that.
      const message = unstable_isUnrecognizedActionError(err)
        ? "The app was updated. Close and reopen it (or reload the page), then try again."
        : err instanceof UploadTimeoutError
          ? `${err.message}. Check the connection and try again.`
          : "Could not create the vacation. Check the connection and try again.";
      toast.error(message);
      report({
        stage: "create-trip",
        status: null,
        message: `${message} [${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}]`,
        contentType: null,
        size: null,
      });
      return null;
    }
  }

  async function uploadOne(index: number, state: FileState, targetTripId: string): Promise<boolean> {
    let stage: UploadStage = "presign";
    // HTTP status of the step that failed; null when no answer arrived.
    let status: number | null = null;
    let fromServer: string | null = null;
    try {
      patchFile(index, { status: "uploading", message: undefined, signIn: false });

      let exif = state.exif;
      if (!exif) {
        exif = parseExif(await state.file.arrayBuffer());
        patchFile(index, { exif });
      }

      let photoId = state.photoId;
      let key = state.key;
      if (!photoId || !key) {
        const presignRes = await withTimeout("presign", (signal) =>
          fetch("/api/upload/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: state.file.name,
              contentType: state.file.type,
              size: state.file.size,
            }),
            signal,
          }),
        );
        status = presignRes.status;
        if (!presignRes.ok) {
          fromServer = await serverError(presignRes);
          throw new Error("presign refused");
        }
        const presign = (await presignRes.json()) as { photoId: string; key: string; url: string };
        photoId = presign.photoId;
        key = presign.key;
        patchFile(index, { photoId, key });

        stage = "put";
        status = null;
        const putRes = await withTimeout("put", (signal) =>
          fetch(presign.url, {
            method: "PUT",
            body: state.file,
            headers: { "Content-Type": state.file.type },
            signal,
          }),
        );
        status = putRes.status;
        if (!putRes.ok) throw new Error("storage refused");
      }

      stage = "finalize";
      status = null;
      patchFile(index, { status: "processing" });
      const finalizeRes = await withTimeout("finalize", (signal) =>
        fetch("/api/upload/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photoId,
            key,
            tripId: targetTripId,
            takenAt: exif.takenAt,
            lat: exif.lat,
            lng: exif.lng,
          }),
          signal,
        }),
      );
      status = finalizeRes.status;
      if (status === 410) {
        // Original never landed in storage: restart this file from presign.
        patchFile(index, { photoId: undefined, key: undefined });
        fromServer = "Upload interrupted, press retry";
        throw new Error("original missing");
      }
      if (!finalizeRes.ok) {
        fromServer = await serverError(finalizeRes);
        throw new Error("finalize refused");
      }
      patchFile(index, { status: "done" });
      return true;
    } catch (err) {
      // A failed send restarts from presign on retry: the old upload URL
      // expires and finalize would only answer 410.
      if (stage === "put") patchFile(index, { photoId: undefined, key: undefined });
      const info =
        err instanceof UploadTimeoutError
          ? { message: `${err.message}. Press retry.`, signIn: false }
          : describeFailure(stage, status, fromServer);
      patchFile(index, { status: "error", message: info.message, signIn: info.signIn });
      report({
        stage,
        status,
        message: `${info.message} [${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}]`,
        contentType: state.file.type || null,
        size: state.file.size,
      });
      return false;
    }
  }

  async function startUpload() {
    setBusy(true);
    reportsLeft.current = MAX_REPORTS_PER_BATCH;
    try {
      const targetTripId = await ensureTrip();
      if (!targetTripId) return;

      const pending = files
        .map((f, i) => ({ f, i }))
        .filter(({ f }) => f.status === "queued" || f.status === "error");

      let cursor = 0;
      let doneInBatch = 0;
      let failedInBatch = 0;
      async function worker() {
        while (cursor < pending.length) {
          const item = pending[cursor];
          cursor += 1;
          if (await uploadOne(item.i, item.f, targetTripId!)) doneInBatch += 1;
          else failedInBatch += 1;
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker),
      );
      router.refresh();
      const summary = batchToast(doneInBatch, failedInBatch);
      if (summary) toast[summary.kind](summary.text);
      // One push per batch per trip, never per photo. Best effort.
      if (doneInBatch > 0) {
        void fetch("/api/push/photos-added", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId: targetTripId, count: doneInBatch }),
        }).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }

  const tripOptions =
    created && !trips.some((t) => t.id === created.id) ? [created, ...trips] : trips;
  const queuedCount = files.filter((f) => f.status === "queued" || f.status === "error").length;
  const hint = uploadHint({ ready, fileCount: files.length, pickerOpen, busy });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Label htmlFor="trip">Vacation</Label>
        <select
          id="trip"
          className="border-input h-11 w-full rounded-md border bg-card px-3 text-base md:h-9 md:text-sm"
          value={tripId}
          onChange={(e) => setTripId(e.target.value)}
        >
          {tripOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} ({t.startDate})
            </option>
          ))}
          <option value="new">+ New vacation...</option>
        </select>
        {tripId === "new" && (
          <div className="rounded-lg border bg-card p-4">
            <VacationFields value={draft} onChange={setDraft} people={people} disabled={busy} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Label htmlFor="photos">Photos</Label>
        <Input
          ref={inputRef}
          id="photos"
          type="file"
          accept="image/*"
          multiple
          className="h-11 py-2 text-base md:h-8 md:py-1 md:text-xs"
          onClick={() => setPickerOpen(true)}
          onChange={(e) => onPick(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {files.map((f, i) => (
            <li key={`${f.file.name}-${i}`} className="flex items-center gap-2">
              {f.status === "done" && <CheckCircle2 className="size-4 shrink-0 text-primary" />}
              {f.status === "error" && <CircleAlert className="size-4 shrink-0 text-destructive" />}
              {(f.status === "uploading" || f.status === "processing") && (
                <Loader2 className="size-4 shrink-0 animate-spin" />
              )}
              {f.status === "queued" && <Upload className="size-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate">{f.file.name}</span>
              {f.status === "error" ? (
                <span className="max-w-[60%] text-right text-xs text-destructive">
                  {f.message}
                  {f.signIn && (
                    <>
                      {" "}
                      <Link href="/login" className="underline">
                        Sign in
                      </Link>
                    </>
                  )}
                </span>
              ) : (
                <span className="shrink-0 text-muted-foreground">{f.status}</span>
              )}
              {f.status === "error" && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  onClick={() => void startUpload()}
                  aria-label="Retry"
                  className="size-11 shrink-0 md:size-7"
                >
                  <RotateCw />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <Button
          onClick={() => void startUpload()}
          disabled={!ready || busy || queuedCount === 0}
          size="lg"
          className="h-11 md:h-9"
        >
          {busy ? "Uploading..." : `Upload ${queuedCount || ""} photo${queuedCount === 1 ? "" : "s"}`}
        </Button>
        {hint && (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
