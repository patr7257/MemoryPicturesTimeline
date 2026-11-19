import { CONTINENTS, countryByKey, UN_MEMBER_TOTAL, COUNTRIES, type Continent } from "./country-catalog";

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

export type Selection =
  | { mode: "single"; personId: string }
  | { mode: "compare"; a: string; b: string }
  | { mode: "union"; personIds: string[] };

export function resolveSelection(input: {
  personIds: readonly string[];
  family: boolean;
  viewerPersonId: string | null;
  allPersonIds: readonly string[];
}): Selection {
  const { family, viewerPersonId, allPersonIds } = input;
  if (family) return { mode: "union", personIds: [...allPersonIds] };
  const known = new Set(allPersonIds);
  const ids = uniq(input.personIds).filter((id) => known.has(id));
  if (ids.length === 0) {
    return viewerPersonId !== null && known.has(viewerPersonId)
      ? { mode: "single", personId: viewerPersonId }
      : { mode: "union", personIds: [...allPersonIds] };
  }
  if (ids.length === 1) return { mode: "single", personId: ids[0] };
  if (ids.length === 2) return { mode: "compare", a: ids[0], b: ids[1] };
  return { mode: "union", personIds: ids };
}

export function comparePartition(
  a: readonly string[],
  b: readonly string[],
): { onlyA: string[]; onlyB: string[]; both: string[] } {
  const ua = uniq(a);
  const ub = uniq(b);
  const inA = new Set(ua);
  const inB = new Set(ub);
  return {
    onlyA: ua.filter((k) => !inB.has(k)),
    onlyB: ub.filter((k) => !inA.has(k)),
    both: ua.filter((k) => inB.has(k)),
  };
}

export type FillState = "visited" | "wishlist" | "onlyA" | "onlyB" | "both";

export function fillsForMarks(marks: readonly CountryMark[]): Record<string, FillState> {
  const out: Record<string, FillState> = {};
  for (const m of marks) {
    if (m.status === "visited" || m.status === "wishlist") out[m.countryKey] = m.status;
  }
  return out;
}

export function fillsForCompare(
  a: readonly string[],
  b: readonly string[],
): Record<string, FillState> {
  const { onlyB, both } = comparePartition(a, b);
  const out: Record<string, FillState> = {};
  for (const k of uniq(a)) out[k] = both.includes(k) ? "both" : "onlyA";
  for (const k of onlyB) out[k] = "onlyB";
  return out;
}

export function fillsForUnion(keys: readonly string[]): Record<string, FillState> {
  const out: Record<string, FillState> = {};
  for (const k of keys) out[k] = "visited";
  return out;
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
