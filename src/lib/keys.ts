// R2 object key layout, shared by presign and finalize so the two routes can
// never drift apart. Pure functions, unit-tested.

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

export const ACCEPTED_MIMES = Object.keys(EXT_BY_MIME);
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

export function extForMime(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null;
}

export function originalKey(photoId: string, mime: string): string {
  return `originals/${photoId}.${extForMime(mime) ?? "bin"}`;
}

export function thumbKey(photoId: string, size: 400 | 1200): string {
  return `thumbs/${photoId}-${size}.webp`;
}
