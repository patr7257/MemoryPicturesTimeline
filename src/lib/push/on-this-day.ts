// Date logic for "on this day". User-facing, so the calendar day is the
// Europe/Copenhagen one (Patrick's decision), never the runner's local clock.
// Trip start dates are plain yyyy-mm-dd strings (Postgres date).
export const CPH_TZ = "Europe/Copenhagen";

export type CalendarDay = { year: number; month: number; day: number };

export function copenhagenDay(now: Date): CalendarDay {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CPH_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export const dayKey = (d: CalendarDay) =>
  `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

// Trips whose start month/day equals today's in an EARLIER year. A Feb 29
// trip only matches on a Feb 29 (documented limitation, rare).
export function tripsOnThisDay<T extends { id: string; title: string; startDate: string }>(
  trips: T[],
  today: CalendarDay,
): (T & { yearsAgo: number })[] {
  const out: (T & { yearsAgo: number })[] = [];
  for (const t of trips) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t.startDate);
    if (!m) continue;
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (month === today.month && day === today.day && year < today.year) {
      out.push({ ...t, yearsAgo: today.year - year });
    }
  }
  return out.sort((a, b) => b.yearsAgo - a.yearsAgo);
}

// Members see different trips, so "on this day" is sent per audience: users
// who may see exactly the same matches share one push. audienceByTrip maps a
// trip id to the user ids that may see it. Item order is kept.
export function groupByVisibleMatches<T extends { id: string }>(
  matches: T[],
  audienceByTrip: ReadonlyMap<string, readonly string[]>,
): { items: T[]; userIds: string[] }[] {
  const itemsByUser = new Map<string, T[]>();
  for (const m of matches) {
    for (const userId of audienceByTrip.get(m.id) ?? []) {
      const list = itemsByUser.get(userId) ?? [];
      list.push(m);
      itemsByUser.set(userId, list);
    }
  }
  const groups = new Map<string, { items: T[]; userIds: string[] }>();
  for (const [userId, items] of itemsByUser) {
    const key = items.map((i) => i.id).join("|");
    const group = groups.get(key) ?? { items, userIds: [] };
    group.userIds.push(userId);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}
