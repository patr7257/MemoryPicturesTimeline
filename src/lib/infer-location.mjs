// @ts-check
// Fill a missing photo location from the same day: a photo without GPS (the
// iPhone picker often strips it) gets the spot of the photo in the same
// vacation taken closest in time on the same calendar day. Plain .mjs with
// JSDoc types so the app (finalize) and the backfill script
// (scripts/fill-locations.mjs) run the very same rule.
//
// takenAt is the camera's wall clock stored as UTC parts (see trip-view.ts),
// so "same day" compares UTC parts. Only real locations are copied, never an
// inferred one, so guesses never chain from photo to photo.

/**
 * @typedef {{
 *   id: string,
 *   tripId: string,
 *   takenAt: Date | null,
 *   lat: number | null,
 *   lng: number | null,
 *   city: string | null,
 *   country: string | null,
 *   locationInferred?: boolean,
 * }} InferPhoto
 */

/**
 * @typedef {{
 *   id: string,
 *   fromId: string,
 *   lat: number,
 *   lng: number,
 *   city: string | null,
 *   country: string | null,
 *   minutesApart: number,
 * }} InferredLocation
 */

/** @param {Date} d */
const dayOf = (d) => `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;

/**
 * Every photo with a date but no location that can borrow one from a real
 * location in the same vacation on the same day. Ties go to the earlier photo.
 * @param {readonly InferPhoto[]} photos
 * @returns {InferredLocation[]}
 */
export function inferLocations(photos) {
  /** @type {Map<string, InferPhoto[]>} */
  const sources = new Map();
  for (const p of photos) {
    if (!p.takenAt || p.lat === null || p.lng === null || p.locationInferred) continue;
    const key = `${p.tripId}|${dayOf(p.takenAt)}`;
    const list = sources.get(key) ?? [];
    list.push(p);
    sources.set(key, list);
  }

  /** @type {InferredLocation[]} */
  const out = [];
  for (const p of photos) {
    if (!p.takenAt || (p.lat !== null && p.lng !== null)) continue;
    const at = p.takenAt.getTime();
    const candidates = sources.get(`${p.tripId}|${dayOf(p.takenAt)}`);
    if (!candidates) continue;
    /** @type {InferPhoto | null} */
    let best = null;
    let bestGap = Infinity;
    for (const c of candidates) {
      const gap = Math.abs(/** @type {Date} */ (c.takenAt).getTime() - at);
      const earlier = best && /** @type {Date} */ (c.takenAt).getTime() < /** @type {Date} */ (best.takenAt).getTime();
      if (gap < bestGap || (gap === bestGap && earlier)) {
        best = c;
        bestGap = gap;
      }
    }
    if (!best || best.lat === null || best.lng === null) continue;
    out.push({
      id: p.id,
      fromId: best.id,
      lat: best.lat,
      lng: best.lng,
      city: best.city,
      country: best.country,
      minutesApart: Math.round(bestGap / 60000),
    });
  }
  return out;
}
