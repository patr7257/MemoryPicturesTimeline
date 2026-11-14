"use client";

// Overview tab: photos grouped per day (one sideways-scrolling row of equal
// square tiles per day, 400px thumbs), each tile showing time, place, caption
// and a note count; the photo
// detail on click; and the vacation-level notes. Photos and comments live in
// local state seeded from the server and re-synced whenever the server sends
// fresh props (every action revalidates), so deletes and notes show at once.
import { useState } from "react";
import { ImagePlus } from "lucide-react";
import Link from "next/link";

import { CommentThread } from "@/components/comments/CommentThread";
import { PhotoDayRow } from "@/components/trip/PhotoDayRow";
import { PhotoDetail } from "@/components/trip/PhotoDetail";
import { Button } from "@/components/ui/button";
import type { CommentView } from "@/lib/comment-queries";
import type { TripPhotoView } from "@/lib/photo-queries";
import { countCommentsByPhoto, groupPhotosByDay } from "@/lib/trip-view";

export function TripOverview({
  tripId,
  tripName,
  startDate,
  tripPin = null,
  photos: serverPhotos,
  comments: serverComments,
}: {
  tripId: string;
  tripName?: string;
  startDate: string;
  // The vacation's pin, where the location picker opens as a last resort.
  tripPin?: { lat: number | null; lng: number | null } | null;
  photos: TripPhotoView[];
  comments: CommentView[];
}) {
  const [photos, setPhotos] = useState(serverPhotos);
  const [seenPhotos, setSeenPhotos] = useState(serverPhotos);
  if (serverPhotos !== seenPhotos) {
    setSeenPhotos(serverPhotos);
    setPhotos(serverPhotos);
  }
  const [comments, setComments] = useState(serverComments);
  const [seenComments, setSeenComments] = useState(serverComments);
  if (serverComments !== seenComments) {
    setSeenComments(serverComments);
    setComments(serverComments);
  }
  const [openId, setOpenId] = useState<string | null>(null);

  const groups = groupPhotosByDay(photos, startDate);
  const ordered = groups.flatMap((g) => g.photos);
  const openIndex = openId ? ordered.findIndex((p) => p.id === openId) : -1;
  const counts = countCommentsByPhoto(comments);

  const addComment = (c: CommentView) => setComments((prev) => [...prev, c]);
  const dropComment = (id: string) => setComments((prev) => prev.filter((c) => c.id !== id));

  function photoDeleted(id: string) {
    const i = ordered.findIndex((p) => p.id === id);
    const neighbour = ordered[i + 1] ?? ordered[i - 1] ?? null;
    setOpenId(neighbour ? neighbour.id : null);
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setComments((prev) => prev.filter((c) => c.photoId !== id));
  }

  return (
    <div className="flex flex-col gap-10">
      {photos.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="font-hand text-3xl text-muted-foreground">No photos here yet.</p>
          <Button
            className="min-h-11 px-4"
            nativeButton={false}
            render={<Link href="/upload" />}
          >
            <ImagePlus data-icon="inline-start" />
            Add photos
          </Button>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-labelledby={`day-${g.key}`}>
            <h2 id={`day-${g.key}`} className="font-hand mb-3 text-3xl leading-tight">
              {g.label}
              <span className="ml-2 font-sans text-xs text-muted-foreground">
                {g.photos.length} {g.photos.length === 1 ? "photo" : "photos"}
              </span>
            </h2>
            <PhotoDayRow
              label={g.label}
              photos={g.photos}
              noteCounts={counts.byPhoto}
              onOpen={setOpenId}
            />
          </section>
        ))
      )}

      <section aria-labelledby="vacation-notes" className="mx-auto w-full max-w-2xl">
        <h2 id="vacation-notes" className="font-hand mb-3 text-3xl leading-tight">
          Notes
        </h2>
        <CommentThread
          tripId={tripId}
          comments={comments.filter((c) => c.photoId === null)}
          onAdded={addComment}
          onDeleted={dropComment}
          placeholder="Write a note about this vacation..."
          emptyText="No notes about this vacation yet."
          idPrefix="trip"
        />
      </section>

      <PhotoDetail
        tripId={tripId}
        tripName={tripName}
        photos={ordered}
        index={openIndex >= 0 ? openIndex : null}
        onIndexChange={(i) => setOpenId(i === null ? null : (ordered[i]?.id ?? null))}
        comments={comments}
        onCommentAdded={addComment}
        onCommentDeleted={dropComment}
        onCaptionChanged={(id, caption) =>
          setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)))
        }
        tripPin={tripPin}
        onLocationChanged={(id, loc) =>
          setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...loc } : p)))
        }
        onTakenAtChanged={(id, takenAt) =>
          setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, takenAt } : p)))
        }
        onPhotoDeleted={photoDeleted}
      />
    </div>
  );
}
