"use client";

// A single polaroid: white frame, thick bottom, tape strip, deterministic
// tilt from the photo id (never Math.random: hydration must match).
import { motion } from "motion/react";

import { imgUrl } from "@/lib/img-url";
import { offsetFor, rotationFor } from "@/lib/scrapbook";
import { cn } from "@/lib/utils";

export type PolaroidPhoto = {
  id: string;
  width: number;
  height: number;
  caption?: string | null;
};

export function PolaroidCard({
  photo,
  index = 0,
  className,
}: {
  photo: PolaroidPhoto;
  index?: number;
  className?: string;
}) {
  const rotation = rotationFor(photo.id);
  const dx = offsetFor(photo.id, "x", 6);

  return (
    <motion.figure
      initial={{ opacity: 0, y: 24, rotate: rotation * 1.6 }}
      whileInView={{ opacity: 1, y: 0, rotate: rotation }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ type: "spring", stiffness: 120, damping: 16, delay: index * 0.06 }}
      style={{ translateX: dx }}
      className={cn(
        "relative w-36 shrink-0 bg-card p-2 pb-7 shadow-[0_2px_10px_var(--paper-shadow)] sm:w-44",
        className,
      )}
    >
      {/* tape strip */}
      <span
        aria-hidden
        className="absolute -top-2 left-1/2 h-4 w-12 -translate-x-1/2 rotate-2 bg-tape shadow-sm"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imgUrl(photo.id, 400)}
        alt={photo.caption ?? "Photo"}
        width={photo.width}
        height={photo.height}
        loading="lazy"
        className="aspect-square w-full bg-muted object-cover"
      />
      {photo.caption && (
        <figcaption className="font-hand absolute inset-x-2 bottom-1 truncate text-center text-sm text-muted-foreground">
          {photo.caption}
        </figcaption>
      )}
    </motion.figure>
  );
}
