"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Loader2, RotateCw, Upload } from "lucide-react";
import { toast } from "sonner";

import { createTrip } from "@/actions/trips";
import { parseExif, type ClientExif } from "@/lib/exif-client";
import type { PersonRef } from "@/lib/queries";
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
  // Kept across retries so finalize stays idempotent.
  photoId?: string;
  key?: string;
  exif?: ClientExif;
};

const CONCURRENCY = 3;

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
  const [tripId, setTripId] = useState<string>(trips[0]?.id ?? "new");
  const [draft, setDraft] = useState(() => emptyDraft(viewerPersonId));
  // The vacation created during this upload, so the select can show it.
  const [created, setCreated] = useState<TripOption | null>(null);
  const [files, setFiles] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(list: FileList | null) {
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
    const { id } = await createTrip({
      title: draft.title,
      startDate: draft.startDate,
      endDate: draft.endDate || null,
      locationName: draft.locationName || null,
      description: draft.description || null,
      personIds: draft.personIds,
    });
    setCreated({ id, title: draft.title.trim(), startDate: draft.startDate });
    setTripId(id);
    return id;
  }

  async function uploadOne(index: number, state: FileState, targetTripId: string): Promise<boolean> {
    try {
      patchFile(index, { status: "uploading", message: undefined });

      let exif = state.exif;
      if (!exif) {
        exif = parseExif(await state.file.arrayBuffer());
        patchFile(index, { exif });
      }

      let photoId = state.photoId;
      let key = state.key;
      if (!photoId || !key) {
        const presignRes = await fetch("/api/upload/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: state.file.name,
            contentType: state.file.type,
            size: state.file.size,
          }),
        });
        if (!presignRes.ok) {
          const err = (await presignRes.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error ?? `Presign failed (${presignRes.status})`);
        }
        const presign = (await presignRes.json()) as { photoId: string; key: string; url: string };
        photoId = presign.photoId;
        key = presign.key;
        patchFile(index, { photoId, key });

        const putRes = await fetch(presign.url, {
          method: "PUT",
          body: state.file,
          headers: { "Content-Type": state.file.type },
        });
        if (!putRes.ok) throw new Error(`Storage upload failed (${putRes.status})`);
      }

      patchFile(index, { status: "processing" });
      const finalizeRes = await fetch("/api/upload/finalize", {
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
      });
      if (finalizeRes.status === 410) {
        // Original never landed in storage: restart this file from presign.
        patchFile(index, { photoId: undefined, key: undefined });
        throw new Error("Upload interrupted, press retry");
      }
      if (!finalizeRes.ok) {
        const err = (await finalizeRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `Processing failed (${finalizeRes.status})`);
      }
      patchFile(index, { status: "done" });
      return true;
    } catch (err) {
      patchFile(index, {
        status: "error",
        message: err instanceof Error ? err.message : "Failed",
      });
      return false;
    }
  }

  async function startUpload() {
    setBusy(true);
    try {
      const targetTripId = await ensureTrip();
      if (!targetTripId) return;

      const pending = files
        .map((f, i) => ({ f, i }))
        .filter(({ f }) => f.status === "queued" || f.status === "error");

      let cursor = 0;
      let doneInBatch = 0;
      async function worker() {
        while (cursor < pending.length) {
          const item = pending[cursor];
          cursor += 1;
          if (await uploadOne(item.i, item.f, targetTripId!)) doneInBatch += 1;
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker),
      );
      router.refresh();
      toast.success("Upload finished");
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
          onChange={(e) => onPick(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {files.map((f, i) => (
            <li key={`${f.file.name}-${i}`} className="flex items-center gap-2">
              {f.status === "done" && <CheckCircle2 className="size-4 text-primary" />}
              {f.status === "error" && <CircleAlert className="size-4 text-destructive" />}
              {(f.status === "uploading" || f.status === "processing") && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {f.status === "queued" && <Upload className="size-4 text-muted-foreground" />}
              <span className="truncate">{f.file.name}</span>
              <span className="text-muted-foreground ml-auto shrink-0">
                {f.status === "error" ? f.message : f.status}
              </span>
              {f.status === "error" && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  onClick={() => void startUpload()}
                  aria-label="Retry"
                  className="size-11 md:size-7"
                >
                  <RotateCw />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Button onClick={() => void startUpload()} disabled={busy || queuedCount === 0} size="lg" className="h-11 md:h-9">
        {busy ? "Uploading..." : `Upload ${queuedCount || ""} photo${queuedCount === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}
