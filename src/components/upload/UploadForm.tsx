"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Loader2, RotateCw, Upload } from "lucide-react";
import { toast } from "sonner";

import { createTrip } from "@/actions/trips";
import { parseExif, type ClientExif } from "@/lib/exif-client";
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

export function UploadForm({ trips }: { trips: TripOption[] }) {
  const router = useRouter();
  const [tripId, setTripId] = useState<string>(trips[0]?.id ?? "new");
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newLocation, setNewLocation] = useState("");
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
    if (!newTitle.trim() || !newDate) {
      toast.error("Give the new trip a title and a start date.");
      return null;
    }
    const { id } = await createTrip({
      title: newTitle,
      startDate: newDate,
      locationName: newLocation || null,
    });
    setTripId(id);
    return id;
  }

  async function uploadOne(index: number, state: FileState, targetTripId: string) {
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
    } catch (err) {
      patchFile(index, {
        status: "error",
        message: err instanceof Error ? err.message : "Failed",
      });
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
      async function worker() {
        while (cursor < pending.length) {
          const item = pending[cursor];
          cursor += 1;
          await uploadOne(item.i, item.f, targetTripId!);
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker),
      );
      router.refresh();
      toast.success("Upload finished");
    } finally {
      setBusy(false);
    }
  }

  const queuedCount = files.filter((f) => f.status === "queued" || f.status === "error").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Label htmlFor="trip">Trip</Label>
        <select
          id="trip"
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
          value={tripId}
          onChange={(e) => setTripId(e.target.value)}
        >
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} ({t.startDate})
            </option>
          ))}
          <option value="new">+ New trip...</option>
        </select>
        {tripId === "new" && (
          <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-title">Title</Label>
              <Input id="new-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Summer in Italy" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-date">Start date</Label>
              <Input id="new-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-location">Place (optional)</Label>
              <Input id="new-location" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Lake Garda, Italy" />
            </div>
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
                >
                  <RotateCw />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Button onClick={() => void startUpload()} disabled={busy || queuedCount === 0} size="lg">
        {busy ? "Uploading..." : `Upload ${queuedCount || ""} photo${queuedCount === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}
