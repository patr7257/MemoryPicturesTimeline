// Matching for the vacation picker on "Add photos". Pure, so it is tested alone.

export type SearchableTrip = {
  title: string;
  startDate: string;
  locationName?: string | null;
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

// Every word of the query must appear in the title, the place or the year.
// "ostrig" and "oestrig" both find "Østrig"; "arhus" and "aarhus" both find
// "Århus". The input order is kept.
export function searchTrips<T extends SearchableTrip>(trips: readonly T[], query: string): T[] {
  const words = fold(query, false).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...trips];
  return trips.filter((t) => {
    const text = `${t.title} ${t.locationName ?? ""} ${t.startDate.slice(0, 4)}`;
    const plain = fold(text, false);
    const spelled = fold(text, true);
    return words.every((w) => plain.includes(w) || spelled.includes(w));
  });
}
