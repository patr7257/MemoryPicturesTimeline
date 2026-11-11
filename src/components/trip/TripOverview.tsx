"use client";

// Overview tab: photos grouped per day (rows album, true aspect ratios, 400px
// thumbs), each tile showing time, place, caption and a note count; the photo
// detail on click; and the vacation-level notes. Photos and comments live in
// local state seeded from the server and re-synced whenever the server sends
// fresh props (every action revalidates), so deletes and notes show at once.
import { useState } from "react";
import { ImagePlus, MessageCircle } from "lucide-react";
import Link from "next/link";
import { RowsPhotoAlbum, type Photo } from "react-photo-album";

import "react-photo-album/rows.css";

import { CommentThread } from "@/components/comments/CommentThread";
import { PhotoDetail } from "@/components/trip/PhotoDetail";
import { Button } from "@/components/ui/button";
import type { CommentView } from "@/lib/comment-queries";
import { imgUrl } from "@/lib/img-url";
import type { TripPhotoView } from "@/lib/photo-queries";
import { countCommentsByPhoto, formatPhotoTime, groupPhotosByDay } from "@/lib/trip-view";

type AlbumPhoto = Photo & { view: TripPhotoView; noteCount: number };

function tileLabel(p: TripPhotoView, noteCount: number): string {
  const bits = [p.caption || "Photo", p.city, formatPhotoTime(p.takenAt)].filter(Boolean);
  if (noteCount > 0) bits.push(`${noteCount} ${noteCount === 1 ? "note" : "notes"}`);
  return bits.join(", ");
}

export function TripOverview({
  tripId,
  tripName,
  startDate,
  photos: serverPhotos,
  comments: serverComments,
}: {
  tripId: string;
  tripName?: string;
  startDate: string;
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
            <RowsPhotoAlbum<AlbumPhoto>
              photos={g.photos.map((p) => {
                const noteCount = counts.byPhoto[p.id] ?? 0;
                return {
                  key: p.id,
                  src: imgUrl(p.id, 400),
                  width: p.width,
                  height: p.height,
                  alt: tileLabel(p, noteCount),
                  view: p,
                  noteCount,
                };
              })}
              targetRowHeight={(w) => (w < 640 ? 150 : 230)}
              spacing={8}
              onClick={({ photo }) => setOpenId(photo.view.id)}
              render={{
                extras: (_, { photo }) => (
                  <>
                    {photo.noteCount > 0 && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white"
                      >
                        <MessageCircle className="size-3" />
                        {photo.noteCount}
                      </span>
                    )}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-white"
                    >
                      {(photo.view.takenAt || photo.view.city) && (
                        <span className="truncate text-xs font-semibold">
                          {[formatPhotoTime(photo.view.takenAt), photo.view.city]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                      {photo.view.caption && (
                        <span className="line-clamp-2 text-xs/snug">{photo.view.caption}</span>
                      )}
                    </span>
                  </>
                ),
              }}
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
        onPhotoDeleted={photoDeleted}
      />
    </div>
  );
}
