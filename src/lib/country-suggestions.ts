// Pure suggestion logic for the countries page: no I/O, unit-tested.

export type SuggestionPoint = {
  tripId: string;
  tripTitle: string;
  tripYear: number;
  countryName: string | null;
  lat: number;
  lng: number;
};

export type CountrySuggestion = {
  countryKey: string;
  tripId: string;
  tripTitle: string;
  year: number;
};

// The tagged trips the viewer may see, in tagged order without duplicates.
// This is what keeps a hidden vacation (and its title) out of suggestions.
export function visibleTaggedTripIds(
  tagged: readonly string[],
  visible: "all" | ReadonlySet<string>,
): string[] {
  return [...new Set(tagged)].filter((id) => visible === "all" || visible.has(id));
}

// At most `perGroup` points per (tripId, countryName) group, in input order.
export function samplePoints(
  points: readonly SuggestionPoint[],
  perGroup = 3,
): SuggestionPoint[] {
  const seen = new Map<string, number>();
  const out: SuggestionPoint[] = [];
  for (const pt of points) {
    const group = JSON.stringify([pt.tripId, pt.countryName]);
    const n = seen.get(group) ?? 0;
    if (n >= perGroup) continue;
    seen.set(group, n + 1);
    out.push(pt);
  }
  return out;
}

// One suggestion per country key: the earliest trip year wins. Keys in
// `existing` are dropped. Output order follows first appearance of the key.
export function pickSuggestions(
  located: readonly { point: SuggestionPoint; countryKey: string | null }[],
  existing: ReadonlySet<string>,
): CountrySuggestion[] {
  const best = new Map<string, CountrySuggestion>();
  for (const { point, countryKey } of located) {
    if (countryKey === null || existing.has(countryKey)) continue;
    const current = best.get(countryKey);
    if (current && current.year <= point.tripYear) continue;
    best.set(countryKey, {
      countryKey,
      tripId: point.tripId,
      tripTitle: point.tripTitle,
      year: point.tripYear,
    });
  }
  return [...best.values()];
}
