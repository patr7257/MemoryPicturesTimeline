// Matching for the vacation picker on "Add photos" and the search on the
// timeline. Pure, so it is tested alone.

export type SearchableTrip = {
  title: string;
  startDate: string;
  locationName?: string | null;
  // The vacation's note. Only the timeline passes it.
  description?: string | null;
  // The tagged people. Only the timeline passes them.
  people?: readonly { name: string }[];
};

// Lower case, accents removed. The Danish letters get their plain form (a
// letter with a ring or stroke does not decompose, so they are mapped).
function fold(text: string, digraphs: boolean): string {
  return text
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, digraphs ? "oe" : "o")
    .replace(/å/g, digraphs ? "aa" : "a")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "");
}

function queryWords(query: string): string[] {
  return fold(query, false).split(/\s+/).filter(Boolean);
}

function matches(t: SearchableTrip, words: readonly string[]): boolean {
  const names = (t.people ?? []).map((p) => p.name).join(" ");
  const text = `${t.title} ${t.locationName ?? ""} ${t.description ?? ""} ${names} ${t.startDate.slice(0, 4)}`;
  const plain = fold(text, false);
  const spelled = fold(text, true);
  return words.every((w) => plain.includes(w) || spelled.includes(w));
}

// Every word of the query must appear in the title, the place, the note, a
// tagged person's name or the year. "ostrig" and "oestrig" both find
// "Østrig"; "arhus" and "aarhus" both find "Århus". The input order is kept.
export function searchTrips<T extends SearchableTrip>(trips: readonly T[], query: string): T[] {
  const words = queryWords(query);
  if (words.length === 0) return [...trips];
  return trips.filter((t) => matches(t, words));
}

// The same search over vacations grouped by year. A year left without a
// vacation is dropped. With an empty query the input comes back as it is.
export function searchYears<T extends SearchableTrip, Y extends { trips: readonly T[] }>(
  years: readonly Y[],
  query: string,
): Y[] {
  const words = queryWords(query);
  if (words.length === 0) return [...years];
  const out: Y[] = [];
  for (const y of years) {
    const trips = y.trips.filter((t) => matches(t, words));
    if (trips.length > 0) out.push({ ...y, trips });
  }
  return out;
}
