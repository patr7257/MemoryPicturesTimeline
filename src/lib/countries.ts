import { CONTINENTS, countryByKey, UN_MEMBER_TOTAL, COUNTRIES, type Continent } from "./country-catalog";
import type { MapFill, MapFills, ThemeFill } from "./country-map-style";
import type { Hex } from "./person-colors";

export type CountryStatus = "visited" | "wishlist" | "dismissed";
export type CountryMark = {
  countryKey: string;
  status: CountryStatus;
  year: number | null;
  note?: string | null;
};

// What every country action returns. Expected refusals come back as data,
// because production builds hide the message of a thrown error.
export type CountryActionResult = { ok: true } | { ok: false; error: string };

// Removing this mark would lose a year or a note the viewer can see, so the
// UI asks first. A note the viewer may not read is never on the mark.
export function needsRemoveConfirm(mark: CountryMark): boolean {
  return typeof mark.year === "number" || (typeof mark.note === "string" && mark.note !== "");
}

// One optimistic change to a person's marks: the new mark for a key, or null
// when the mark goes. Pure, so it can be the useOptimistic reducer.
export type MarkChange = { key: string; mark: CountryMark | null };

export function applyMarkChange(marks: readonly CountryMark[], change: MarkChange): CountryMark[] {
  const rest = marks.filter((m) => m.countryKey !== change.key);
  return change.mark ? [...rest, change.mark] : rest;
}

// The mark a status change shows before the server answers, by the server's
// year rule: visited without a year (undefined) keeps a stored visited year,
// an explicit null clears it, any other status has none. A note the viewer
// already has stays on the mark.
export function markAfterStatus(
  prev: CountryMark | undefined,
  key: string,
  status: CountryStatus,
  year?: number | null,
): CountryMark {
  const kept = prev?.status === "visited" ? prev.year : null;
  const mark: CountryMark = {
    countryKey: key,
    status,
    year: status !== "visited" ? null : year === undefined ? kept : year,
  };
  if (prev && "note" in prev) mark.note = prev.note;
  return mark;
}

export type CountryStats = {
  total: number;
  unMembers: number;
  unTotal: number;
  percent: number;
  continents: { continent: Continent; visited: number; total: number }[];
};

const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

export function countryStats(visitedKeys: readonly string[]): CountryStats {
  const visited = uniq(visitedKeys).flatMap((k) => {
    const c = countryByKey(k);
    return c ? [c] : [];
  });
  const unMembers = visited.filter((c) => c.unMember).length;
  return {
    total: visited.length,
    unMembers,
    unTotal: UN_MEMBER_TOTAL,
    percent: Math.round((unMembers / UN_MEMBER_TOTAL) * 100),
    continents: CONTINENTS.map((continent) => ({
      continent,
      visited: visited.filter((c) => c.continent === continent).length,
      total: COUNTRIES.filter((c) => c.continent === continent).length,
    })),
  };
}

// The year limit for a visited year follows the family's calendar, so New
// Year's Eve after 23:00 UTC already counts as the new year.
export const YEAR_ZONE = "Europe/Copenhagen";

export function currentYearIn(timeZone: string, now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric" }).format(now));
}

export function fillsForMarks(marks: readonly CountryMark[]): MapFills {
  const out: MapFills = {};
  for (const m of marks) {
    if (m.status === "visited" || m.status === "wishlist") out[m.countryKey] = m.status;
  }
  return out;
}

const LEGEND_ORDER: readonly ThemeFill[] = ["visited", "wishlist"];

// The theme fills in use, once each: the map legend names every one of them,
// so a colour on the map is never left unexplained. Person colours get their
// legend entries from the view, which knows the names.
export function legendFills(fills: MapFills): ThemeFill[] {
  const used = new Set<MapFill>(Object.values(fills));
  return LEGEND_ORDER.filter((f) => used.has(f));
}

type ByPerson = Readonly<Record<string, readonly string[]>>;

// For each country the people (in the order given) who visited it, and the
// countries more than one of them visited.
export function partitionVisitors(byPerson: ByPerson): {
  visitorsByKey: Record<string, string[]>;
  sharedKeys: string[];
} {
  const visitorsByKey: Record<string, string[]> = {};
  for (const [personId, keys] of Object.entries(byPerson)) {
    for (const key of uniq(keys)) (visitorsByKey[key] ??= []).push(personId);
  }
  const sharedKeys = Object.keys(visitorsByKey).filter((k) => visitorsByKey[k].length > 1);
  return { visitorsByKey, sharedKeys };
}

// One visitor: that person's colour. More than one: the shared colour.
export function fillsForPeople(byPerson: ByPerson, colors: Readonly<Record<string, Hex>>, shared: Hex): MapFills {
  const out: MapFills = {};
  for (const [key, visitors] of Object.entries(partitionVisitors(byPerson).visitorsByKey)) {
    out[key] = visitors.length > 1 ? shared : colors[visitors[0]] ?? shared;
  }
  return out;
}

export function multiStats(byPerson: ByPerson): { perPerson: Record<string, number>; shared: number; total: number } {
  const perPerson: Record<string, number> = {};
  for (const [personId, keys] of Object.entries(byPerson)) perPerson[personId] = uniq(keys).length;
  const { visitorsByKey, sharedKeys } = partitionVisitors(byPerson);
  return { perPerson, shared: sharedKeys.length, total: Object.keys(visitorsByKey).length };
}

// Search form of a country name or query: lower case, no diacritics, and the
// Nordic letters NFD does not decompose (æ, ø) folded to plain Latin.
export function countrySearchKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export const YEAR_MIN = 1900;
export const NOTE_MAX = 500;

export function parseYear(
  raw: unknown,
  currentYear: number,
): { ok: true; year: number | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, year: null };
  let year: number;
  if (typeof raw === "number") {
    year = raw;
  } else if (typeof raw === "string") {
    const s = raw.trim();
    if (s === "") return { ok: true, year: null };
    if (!/^\d{4}$/.test(s)) return { ok: false };
    year = Number(s);
  } else {
    return { ok: false };
  }
  if (!Number.isInteger(year) || year < YEAR_MIN || year > currentYear) return { ok: false };
  return { ok: true, year };
}

export function cleanNote(raw: unknown): { ok: true; note: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, note: null };
  if (typeof raw !== "string") return { ok: false };
  const note = raw.trim();
  if (note.length > NOTE_MAX) return { ok: false };
  return { ok: true, note: note === "" ? null : note };
}
