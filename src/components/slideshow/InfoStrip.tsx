import { dateAndPlaceLine, type SlideshowPhoto } from "@/lib/slideshow";

// Text over the photo: readable on any picture thanks to the dark gradient,
// capped at about a third of the screen so the photo stays the star.
export function InfoStrip({
  photo,
  showTripTitle,
  lift,
}: {
  photo: SlideshowPhoto;
  showTripTitle: boolean;
  // Leave room for the control bar while it is visible.
  lift: boolean;
}) {
  const line = dateAndPlaceLine(photo);
  const caption = photo.caption?.trim() || null;
  const comments = photo.comments.slice(0, 2);
  if (!line && !caption && comments.length === 0 && !showTripTitle) return null;

  return (
    <div
      className={
        "pointer-events-none absolute inset-x-0 bottom-0 max-h-[33dvh] overflow-hidden bg-gradient-to-t from-black/85 via-black/60 to-transparent px-4 pt-12 text-white transition-[padding] duration-300 sm:px-8 " +
        (lift
          ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
          : "pb-[calc(1rem+env(safe-area-inset-bottom))]")
      }
      style={{ textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}
    >
      <div className="mx-auto max-w-3xl space-y-1 text-center">
        {showTripTitle && (
          <p className="truncate text-xs font-medium tracking-wide text-white/75 uppercase">
            {photo.tripTitle}
          </p>
        )}
        {line && <p className="font-hand text-2xl leading-tight sm:text-3xl">{line}</p>}
        {caption && <p className="line-clamp-3 text-sm sm:text-base">{caption}</p>}
        {comments.map((c, i) => (
          <p key={i} className="line-clamp-2 text-xs text-white/85 sm:text-sm">
            <span className="font-semibold">{c.authorName}:</span> {c.body}
          </p>
        ))}
      </div>
    </div>
  );
}
