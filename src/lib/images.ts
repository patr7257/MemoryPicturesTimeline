// Server-side image processing at upload time (sharp): EXIF-oriented WebP
// thumbnails at two fixed widths plus a blurhash placeholder. Pre-generating
// fixed sizes is what lets the app skip next/image optimization entirely.
import { encode } from "blurhash";
import sharp, { type Sharp } from "sharp";

export type ProcessedImage = {
  width: number;
  height: number;
  thumb400: Buffer;
  thumb1200: Buffer;
  blurhash: string | null;
};

export async function processOriginal(original: Buffer): Promise<ProcessedImage> {
  // .rotate() with no args applies the EXIF orientation, so thumbnails are
  // upright even when the original relies on the orientation tag.
  const base = sharp(original).rotate();
  const meta = await base.metadata();

  // Post-rotation dimensions: EXIF orientations 5-8 swap width/height.
  const swapped = (meta.orientation ?? 1) >= 5;
  const width = (swapped ? meta.height : meta.width) ?? 0;
  const height = (swapped ? meta.width : meta.height) ?? 0;

  const [thumb400, thumb1200, blur] = await Promise.all([
    base
      .clone()
      .resize({ width: 400, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(),
    base
      .clone()
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(),
    computeBlurhash(base),
  ]);

  return { width, height, thumb400, thumb1200, blurhash: blur };
}

async function computeBlurhash(base: Sharp): Promise<string | null> {
  try {
    const { data, info } = await base
      .clone()
      .resize(32, 32, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
  } catch {
    // Blurhash is a nicety; a failure must never fail the upload.
    return null;
  }
}
