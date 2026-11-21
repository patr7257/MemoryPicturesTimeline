// Pure planner for auto-visited countries. Relative imports only: the backfill
// script loads this file through tsx, outside the Next.js alias setup.

export type LatLng = { lat: number; lng: number };

// Two photos within about a kilometre share a country lookup.
export const POINT_DECIMALS = 2;

// Rounded points, duplicates dropped, first-seen order.
export function distinctPoints(points: readonly LatLng[], decimals: number = POINT_DECIMALS): LatLng[] {
  const factor = 10 ** decimals;
  const seen = new Set<string>();
  const out: LatLng[] = [];
  for (const p of points) {
    const lat = Math.round(p.lat * factor) / factor;
    const lng = Math.round(p.lng * factor) / factor;
    const key = `${lat}|${lng}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ lat, lng });
  }
  return out;
}

// The points a vacation is located by: its GPS photos, or, only when it has
// none, its own place. The own place of a vacation with photos is a leftover
// (the spot of the first photo ever uploaded to it) and can be wrong.
export function vacationPoints(photoPoints: readonly LatLng[], place: LatLng | null): LatLng[] {
  if (photoPoints.length > 0) return [...photoPoints];
  return place ? [place] : [];
}

export function rowKey(personId: string, countryKey: string): string {
  return `${personId}|${countryKey}`;
}

export type VacationCountries = {
  tripId: string;
  startDate: string;
  personIds: readonly string[];
  countryKeys: readonly string[];
};

export type VisitedInsert = { personId: string; countryKey: string; year: number };

// One row per person and country that has no row yet (in any status). The year
// is the earliest vacation's start year, whatever the input order.
export function planVisitedRows(
  vacations: readonly VacationCountries[],
  existing: ReadonlySet<string>,
): VisitedInsert[] {
  const sorted = [...vacations].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const planned = new Map<string, VisitedInsert>();
  for (const v of sorted) {
    const year = Number(v.startDate.slice(0, 4));
    for (const personId of v.personIds) {
      for (const countryKey of v.countryKeys) {
        const key = rowKey(personId, countryKey);
        if (existing.has(key) || planned.has(key)) continue;
        planned.set(key, { personId, countryKey, year });
      }
    }
  }
  return [...planned.values()];
}

export type VisitedStore = {
  // points: GPS photos plus the vacation's own place when both lat and lng are set.
  vacation(tripId: string): Promise<{ startDate: string; personIds: string[]; points: LatLng[] } | null>;
  // Keys (rowKey) of every row in any status: visited, wishlist, dismissed.
  existingKeys(personIds: readonly string[]): Promise<Set<string>>;
  // ON CONFLICT DO NOTHING; returns how many rows were written.
  insertVisited(rows: readonly VisitedInsert[]): Promise<number>;
};

export type Locate = (lat: number, lng: number) => Promise<string | null> | string | null;

// Rows it asked the store to insert for one vacation.
export async function syncVacationCore(
  store: VisitedStore,
  tripId: string,
  locate: Locate,
): Promise<VisitedInsert[]> {
  const vacation = await store.vacation(tripId);
  if (!vacation || vacation.personIds.length === 0) return [];
  const keys = new Set<string>();
  for (const p of distinctPoints(vacation.points)) {
    const key = await locate(p.lat, p.lng);
    if (key !== null) keys.add(key);
  }
  if (keys.size === 0) return [];
  const existing = await store.existingKeys(vacation.personIds);
  const rows = planVisitedRows(
    [{ tripId, startDate: vacation.startDate, personIds: vacation.personIds, countryKeys: [...keys] }],
    existing,
  );
  if (rows.length > 0) await store.insertVisited(rows);
  return rows;
}
