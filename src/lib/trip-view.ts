// Pure helpers for the vacation pages: day grouping, date text, input
// validation. No I/O, no clocks, no runtime-zone dependence, so the server and
// the browser render identical text (hydration) and the tests are stable.

export const COMMENT_MAX = 2000;
export const CAPTION_MAX = 500;

// photos.takenAt is a `timestamp` WITHOUT time zone that holds the camera's
// local wall-clock time, read back as if it were UTC. Reading its UTC parts
// therefore returns the wall clock the photographer saw.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const pad = (n: number) => String(n).padStart(2, "0");

function dayText(d: Date, long = false): string {
  const wd = (long ? WEEKDAYS_LONG : WEEKDAYS)[d.getUTCDay()];
  return `${wd} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatPhotoTime(d: Date | null): string {
  return d ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : "";
}

export function formatPhotoDate(d: Date | null): string {
  return d ? dayText(d) : "";
}

export function formatPhotoDateTime(d: Date | null): string {
  return d ? `${dayText(d)}, ${formatPhotoTime(d)}` : "";
}

// comments.createdAt is a real instant (server clock). It is shown in the
// family's own zone, pinned explicitly so the output never depends on the
// runtime. Decision for the owner: change this one constant for another zone.
export const COMMENT_TIME_ZONE = "Europe/Copenhagen";

const COMMENT_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: COMMENT_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatCommentTime(d: Date): string {
  const parts = Object.fromEntries(COMMENT_FMT.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}

export type DayGroup<P> = {
  // yyyy-mm-dd, or "undated".
  key: string;
  label: string;
  photos: P[];
};

const isoDay = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

const dayIndex = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

// Dated photos grouped per calendar day (earliest first, each day ordered by
// time, ties keep input order), undated photos last. "Day N" counts from the
// vacation's start date, or from the first photo day when photos precede it.
export function groupPhotosByDay<P extends { takenAt: Date | null }>(
  photos: readonly P[],
  tripStartDate: string,
): DayGroup<P>[] {
  const byDay = new Map<string, P[]>();
  const undated: P[] = [];
  for (const p of photos) {
    if (!p.takenAt) {
      undated.push(p);
      continue;
    }
    const key = isoDay(p.takenAt);
    const list = byDay.get(key) ?? [];
    list.push(p);
    byDay.set(key, list);
  }

  const keys = Array.from(byDay.keys()).sort();
  const base = keys.length > 0 ? Math.min(dayIndex(tripStartDate), dayIndex(keys[0])) : 0;

  const groups: DayGroup<P>[] = keys.map((key) => {
    const list = (byDay.get(key) as P[])
      .slice()
      .sort((a, b) => (a.takenAt as Date).getTime() - (b.takenAt as Date).getTime());
    const n = dayIndex(key) - base + 1;
    return { key, label: `Day ${n}, ${dayText(list[0].takenAt as Date)}`, photos: list };
  });
  if (undated.length > 0) groups.push({ key: "undated", label: "Undated", photos: undated });
  return groups;
}

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateCommentBody(raw: unknown): Validated<string> {
  if (typeof raw !== "string") return { ok: false, error: "Write something first" };
  const value = raw.trim();
  if (value.length === 0) return { ok: false, error: "Write something first" };
  if (value.length > COMMENT_MAX) {
    return { ok: false, error: `A note can be at most ${COMMENT_MAX} characters` };
  }
  return { ok: true, value };
}

// An empty caption is valid and means "remove it" (null).
export function validateCaption(raw: unknown): Validated<string | null> {
  if (typeof raw !== "string") return { ok: false, error: "Caption must be text" };
  const value = raw.trim();
  if (value.length > CAPTION_MAX) {
    return { ok: false, error: `A caption can be at most ${CAPTION_MAX} characters` };
  }
  return { ok: true, value: value.length === 0 ? null : value };
}

export function countCommentsByPhoto(
  comments: readonly { photoId: string | null }[],
): { byPhoto: Record<string, number>; trip: number } {
  const byPhoto: Record<string, number> = {};
  let trip = 0;
  for (const c of comments) {
    if (c.photoId === null) trip++;
    else byPhoto[c.photoId] = (byPhoto[c.photoId] ?? 0) + 1;
  }
  return { byPhoto, trip };
}
