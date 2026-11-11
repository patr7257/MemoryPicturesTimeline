"use client";

// A thumbnail with a blurhash painted behind it while the real image loads.
// The blurhash is decoded on the client after mount only (never during
// server render), so server and client markup match. The image sits on top
// of the canvas and simply covers it once it has painted.
import { useEffect, useRef } from "react";
import { decode } from "blurhash";

import { cn } from "@/lib/utils";

const SAMPLE = 24;

export function BlurhashImage({
  src,
  alt,
  blurhash,
  width,
  height,
  className,
  imgClassName,
  loading = "lazy",
}: {
  src: string;
  alt: string;
  blurhash?: string | null;
  width?: number;
  height?: number;
  className?: string;
  imgClassName?: string;
  loading?: "lazy" | "eager";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!blurhash || !canvas) return;
    try {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const pixels = decode(blurhash, SAMPLE, SAMPLE);
      const data = ctx.createImageData(SAMPLE, SAMPLE);
      data.data.set(pixels);
      ctx.putImageData(data, 0, 0);
    } catch {
      // A malformed hash just leaves the plain muted background.
    }
  }, [blurhash]);

  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {blurhash && (
        <canvas
          ref={canvasRef}
          width={SAMPLE}
          height={SAMPLE}
          aria-hidden
          className="absolute inset-0 size-full"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
        className={cn("relative size-full object-cover", imgClassName)}
      />
    </div>
  );
}
