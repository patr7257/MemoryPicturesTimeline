// Client-and-server-safe URL builder for the authenticated image proxy.
// Same-origin relative URLs work everywhere in this app (no basePath).
export type ImgSize = 400 | 1200 | "orig";

export function imgUrl(photoId: string, size: ImgSize): string {
  return `/api/img/${photoId}/${size}`;
}
