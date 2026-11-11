"use client";

// The front of the postcard: the photo, uncropped, on a white print with a
// short handwritten caption line. The whole card is one button that turns it
// over (click, Enter or Space).
import type { TripPhotoView } from "@/lib/photo-queries";
import { imgUrl } from "@/lib/img-url";
import { frontCaption } from "@/lib/postcard";

export function PostcardFront({
  photo,
  onTurn,
}: {
  photo: TripPhotoView;
  onTurn: () => void;
}) {
  const alt = photo.caption ?? (photo.city ? `Photo from ${photo.city}` : "Photo");
  const line = frontCaption(photo.caption);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${alt}. Turn the photo over to read the back`}
      onClick={onTurn}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTurn();
        }
      }}
      className="flex h-full cursor-pointer flex-col bg-white px-3 pt-3 pb-1 outline-none focus-visible:ring-4 focus-visible:ring-ring/60 sm:px-4 sm:pt-4"
    >
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {/* The proxy serves the 1200px WebP; no next/image by design. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgUrl(photo.id, 1200)}
          alt=""
          draggable={false}
          className="max-h-full max-w-full object-contain select-none"
        />
      </div>
      <p
        aria-hidden
        className="flex h-12 shrink-0 items-center justify-center px-2 text-center font-hand text-2xl leading-none text-neutral-700 sm:h-14 sm:text-3xl"
      >
        <span className="truncate">{line}</span>
      </p>
    </div>
  );
}
