// Pure slideshow logic: no React, no database, no browser APIs, so it is unit
// tested in slideshow.test.ts and shared by the server queries and the player.

export type SlideshowComment = { authorName: string; body: string };

// One photo as the player needs it. Nothing here is sensitive beyond what the
// viewer may already see on the vacation page.
export type SlideshowPhoto = {
  id: string;
  width: number;
  height: number;
  // ISO string of the camera's wall-clock time (stored without a zone, read as
  // UTC), or null when unknown.
  takenAt: string | null;
  city: string | null;
  country: string | null;
  caption: string | null;
  tripId: string;
  tripTitle: string;
  // YYYY-MM-DD
  tripStartDate: string;
  // The photo's own comments, oldest first.
  comments: SlideshowComment[];
};

export type SlideshowOrder = "time" | "shuffle";

// "projector" is the default 3D slide projector; "simple" is the plain fade
// (also what the player falls back to without WebGL or with reduced motion).
export type SlideshowStyle = "projector" | "simple";

export type SlideshowSettings = {
  order: SlideshowOrder;
  // Dates, places, captions and comments on top of the photo.
  showInfo: boolean;
  seconds: number;
  style: SlideshowStyle;
};

export const MIN_SECONDS = 2;
export const MAX_SECONDS = 30;
export const DEFAULT_SETTINGS: SlideshowSettings = {
  order: "time",
  showInfo: true,
  seconds: 5,
  style: "projector",
};
export const SETTINGS_STORAGE_KEY = "memories.slideshow.settings.v1";

export function clampSeconds(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.seconds;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(value)));
}

// Saved settings come from localStorage: anything can be in there.
export function parseSettings(raw: string | null | undefined): SlideshowSettings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (typeof data !== "object" || data === null) return { ...DEFAULT_SETTINGS };
  const d = data as Record<string, unknown>;
  return {
    order: d.order === "shuffle" || d.order === "time" ? d.order : DEFAULT_SETTINGS.order,
    showInfo: typeof d.showInfo === "boolean" ? d.showInfo : DEFAULT_SETTINGS.showInfo,
    seconds: typeof d.seconds === "number" ? clampSeconds(d.seconds) : DEFAULT_SETTINGS.seconds,
    style: d.style === "projector" || d.style === "simple" ? d.style : DEFAULT_SETTINGS.style,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Repeated `person` query params (Next hands over string | string[] | undefined):
// keeps only well-formed ids, lower-cased, deduped, in first-seen order. Whether
// an id belongs to a real person is the caller's business. This is the one place
// that parses the param, so it can be swapped for the shared person-filter helper.
export function parsePersonParam(raw: string | readonly string[] | undefined): string[] {
  const list = raw === undefined ? [] : typeof raw === "string" ? [raw] : raw;
  const out: string[] = [];
  for (const value of list) {
    if (typeof value !== "string" || !UUID.test(value)) continue;
    const id = value.toLowerCase();
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

// The selection after clicking a person's chip: removes the id when it is
// selected, otherwise appends it.
export function togglePerson(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

// "everyone", "Anna", "Anna and Ben", "Anna, Ben and Cleo".
export function selectionTitle(names: readonly string[]): string {
  if (names.length === 0) return "everyone";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// mulberry32: tiny seeded PRNG, also used for the projector's dust and drift.
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates on a copy. Same seed, same order; never mutates the input.
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const rand = prng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type Sortable = { takenAt: string | null; tripStartDate: string; tripId: string };

// Vacations by start date, then within a vacation dated photos by takenAt with
// undated ones last. Stable, so equal items keep their input order.
export function sortByTime<T extends Sortable>(items: readonly T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const x = a.item;
      const y = b.item;
      if (x.tripStartDate !== y.tripStartDate) return x.tripStartDate < y.tripStartDate ? -1 : 1;
      if (x.tripId !== y.tripId) return x.tripId < y.tripId ? -1 : 1;
      if (x.takenAt !== y.takenAt) {
        if (x.takenAt === null) return 1;
        if (y.takenAt === null) return -1;
        return x.takenAt < y.takenAt ? -1 : 1;
      }
      return a.i - b.i;
    })
    .map((e) => e.item);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// "less than a minute", "about 7 minutes", "about 1 hour 5 minutes".
export function estimateLabel(photoCount: number, seconds: number): string {
  const total = photoCount * seconds;
  if (total < 30) return "less than a minute";
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `about ${plural(minutes, "minute", "minutes")}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = plural(h, "hour", "hours");
  return m === 0 ? `about ${hours}` : `about ${hours} ${plural(m, "minute", "minutes")}`;
}

// "84 photos from 6 vacations, about 7 minutes"
export function summaryLabel(photoCount: number, tripCount: number, seconds: number): string {
  if (photoCount === 0) return "No photos yet";
  return `${plural(photoCount, "photo", "photos")} from ${plural(tripCount, "vacation", "vacations")}, ${estimateLabel(photoCount, seconds)}`;
}

export type Step = { kind: "go"; index: number } | { kind: "end" } | { kind: "stay" };

// Next or previous slide, skipping indexes in `skip` (photos that failed to
// load). Going forward past the last slide ends the show; going back before
// the first one stays put.
export function stepIndex(
  index: number,
  dir: 1 | -1,
  length: number,
  skip: ReadonlySet<number> = new Set(),
): Step {
  for (let j = index + dir; j >= 0 && j < length; j += dir) {
    if (!skip.has(j)) return { kind: "go", index: j };
  }
  return dir === 1 ? { kind: "end" } : { kind: "stay" };
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

// takenAt holds the camera's wall-clock time, so format in UTC: the server and
// every browser then print the same text.
export function formatTakenAt(takenAt: string | null): string | null {
  if (!takenAt) return null;
  const d = new Date(takenAt);
  return Number.isNaN(d.getTime()) ? null : DATE_FORMAT.format(d);
}

export function formatPlace(city: string | null, country: string | null): string | null {
  const parts = [city, country].map((s) => s?.trim()).filter((s): s is string => !!s);
  return parts.length > 0 ? parts.join(", ") : null;
}

// "12 July 2024 - Lisbon, Portugal" (either half may be missing).
export function dateAndPlaceLine(
  p: Pick<SlideshowPhoto, "takenAt" | "city" | "country">,
): string | null {
  const parts = [formatTakenAt(p.takenAt), formatPlace(p.city, p.country)].filter(
    (s): s is string => !!s,
  );
  return parts.length > 0 ? parts.join(" - ") : null;
}

// Small deterministic Ken Burns drift (percent) derived from the photo id, so
// a photo always drifts the same way and render stays pure.
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function driftFor(id: string): { x: number; y: number } {
  const h = hashId(id);
  const a = h % 5;
  const b = (h >>> 8) % 5;
  return { x: a - 2, y: b - 2 };
}

export function tripCountOf(photos: readonly { tripId: string }[]): number {
  return new Set(photos.map((p) => p.tripId)).size;
}
