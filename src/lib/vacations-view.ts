// Pure helpers behind the /vacations overview: search, filters, sorting,
// summary stats, trip length and the URL query-string state. No React, no
// database: everything here is unit tested (vacations-view.test.ts).
//
// Dates are plain "yyyy-mm-dd" strings; day maths uses UTC so the result never
// depends on the runner's local clock or daylight saving.

export type VacationItem = {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  locationName: string | null;
  people: { id: string; name: string }[];
  photoCount: number;
};

export const SORT_KEYS = ["newest", "oldest", "photos", "title"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  photos: "Most photos",
  title: "Title A to Z",
};

export const VIEW_MODES = ["table", "cards"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export type ViewState = {
  q: string;
  person: string | null;
  year: number | null;
  sort: SortKey;
  // "table" means table from the md breakpoint up and cards on phones;
  // "cards" means cards everywhere.
  view: ViewMode;
};

export const DEFAULT_VIEW_STATE: ViewState = {
  q: "",
  person: null,
  year: null,
  sort: "newest",
  view: "table",
};

const MAX_QUERY_LENGTH = 100;
const MAX_ID_LENGTH = 64;

// ---------------------------------------------------------------- URL state

type ParamReader = { get(name: string): string | null };

export function parseViewState(params: ParamReader): ViewState {
  const q = (params.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);

  const rawPerson = (params.get("person") ?? "").trim();
  const person = rawPerson && rawPerson.length <= MAX_ID_LENGTH ? rawPerson : null;

  const rawYear = params.get("year") ?? "";
  const year = /^\d{4}$/.test(rawYear) ? Number(rawYear) : null;

  const rawSort = params.get("sort");
  const sort = (SORT_KEYS as readonly string[]).includes(rawSort ?? "")
    ? (rawSort as SortKey)
    : DEFAULT_VIEW_STATE.sort;

  const rawView = params.get("view");
  const view = (VIEW_MODES as readonly string[]).includes(rawView ?? "")
    ? (rawView as ViewMode)
    : DEFAULT_VIEW_STATE.view;

  return { q, person, year, sort, view };
}

// Query string without the leading "?"; defaults are omitted so the plain
// /vacations URL stays clean.
export function serializeViewState(state: ViewState): string {
  const out = new URLSearchParams();
  const q = state.q.trim();
  if (q) out.set("q", q);
  if (state.person) out.set("person", state.person);
  if (state.year !== null) out.set("year", String(state.year));
  if (state.sort !== DEFAULT_VIEW_STATE.sort) out.set("sort", state.sort);
  if (state.view !== DEFAULT_VIEW_STATE.view) out.set("view", state.view);
  return out.toString();
}

export function hasActiveFilters(state: ViewState): boolean {
  return state.q.trim() !== "" || state.person !== null || state.year !== null;
}

// ------------------------------------------------------------------- search

// Lowercase and strip combining accents so "Cote d'Azur" finds "Côte d'Azur".
function normalise(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Every whitespace separated term must appear in the title, place or notes.
export function matchesQuery(item: VacationItem, query: string): boolean {
  const terms = normalise(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalise(
    [item.title, item.locationName ?? "", item.description ?? ""].join("\n"),
  );
  return terms.every((term) => haystack.includes(term));
}

export function startYear(item: Pick<VacationItem, "startDate">): number {
  return Number(item.startDate.slice(0, 4));
}

export function filterVacations<T extends VacationItem>(
  items: readonly T[],
  state: Pick<ViewState, "q" | "person" | "year">,
): T[] {
  return items.filter(
    (item) =>
      matchesQuery(item, state.q) &&
      (state.person === null || item.people.some((p) => p.id === state.person)) &&
      (state.year === null || startYear(item) === state.year),
  );
}

// Distinct start years, newest first (feeds the year filter).
export function availableYears(items: readonly Pick<VacationItem, "startDate">[]): number[] {
  return Array.from(new Set(items.map(startYear))).sort((a, b) => b - a);
}

// ------------------------------------------------------------------ sorting

const byTitle = (a: VacationItem, b: VacationItem) =>
  a.title.localeCompare(b.title, "en", { sensitivity: "base", numeric: true });
const byStartDesc = (a: VacationItem, b: VacationItem) =>
  a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0;
const byStartAsc = (a: VacationItem, b: VacationItem) => -byStartDesc(a, b);
const byId = (a: VacationItem, b: VacationItem) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const COMPARATORS: Record<SortKey, (a: VacationItem, b: VacationItem) => number> = {
  newest: (a, b) => byStartDesc(a, b) || byTitle(a, b) || byId(a, b),
  oldest: (a, b) => byStartAsc(a, b) || byTitle(a, b) || byId(a, b),
  photos: (a, b) =>
    b.photoCount - a.photoCount || byStartDesc(a, b) || byTitle(a, b) || byId(a, b),
  title: (a, b) => byTitle(a, b) || byStartDesc(a, b) || byId(a, b),
};

// New array; ties always resolve the same way, so the order never flickers.
export function sortVacations<T extends VacationItem>(items: readonly T[], sort: SortKey): T[] {
  return [...items].sort(COMPARATORS[sort]);
}

export function applyViewState<T extends VacationItem>(items: readonly T[], state: ViewState): T[] {
  return sortVacations(filterVacations(items, state), state.sort);
}

// -------------------------------------------------------------------- dates

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

// Inclusive length: a one-day trip is 1 day, 28 Dec to 3 Jan is 7. A missing
// or earlier end date counts as one day.
export function lengthInDays(startDate: string, endDate: string | null): number {
  if (!endDate) return 1;
  return Math.max(1, dayNumber(endDate) - dayNumber(startDate) + 1);
}

// -------------------------------------------------------------------- stats

export type VacationStats = {
  count: number;
  photos: number;
  firstYear: number | null;
  lastYear: number | null;
  places: number;
};

export function computeStats(items: readonly VacationItem[]): VacationStats {
  const years = items.map(startYear);
  const places = new Set(
    items
      .map((i) => normalise((i.locationName ?? "").trim()))
      .filter((name) => name !== ""),
  );
  return {
    count: items.length,
    photos: items.reduce((sum, i) => sum + i.photoCount, 0),
    firstYear: years.length ? Math.min(...years) : null,
    lastYear: years.length ? Math.max(...years) : null,
    places: places.size,
  };
}

export function formatYearSpan(stats: Pick<VacationStats, "firstYear" | "lastYear">): string {
  if (stats.firstYear === null || stats.lastYear === null) return "none";
  return stats.firstYear === stats.lastYear
    ? String(stats.firstYear)
    : `${stats.firstYear} to ${stats.lastYear}`;
}

// ------------------------------------------------------------ list item type

// What the /vacations page hands to the client: the sortable fields plus what
// the cards and table rows need to draw.
export type VacationListItem = VacationItem & {
  coverPhotoId: string | null;
  coverBlurhash: string | null;
  canManage: boolean;
};

// -------------------------------------------------------------- create / edit

export type VacationDraft = {
  title: string;
  startDate: string;
  endDate: string;
  locationName: string;
  description: string;
  personIds: string[];
};

// A new vacation starts with the creator's own person tagged (when they have one).
export function emptyDraft(viewerPersonId: string | null): VacationDraft {
  return {
    title: "",
    startDate: "",
    endDate: "",
    locationName: "",
    description: "",
    personIds: viewerPersonId ? [viewerPersonId] : [],
  };
}

// First problem with the draft as a sentence for a toast, or null when valid.
export function draftError(draft: VacationDraft): string | null {
  if (!draft.title.trim()) return "Give the vacation a title.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate)) return "Pick a start date.";
  if (draft.endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.endDate)) return "The end date is not a valid date.";
    if (draft.endDate < draft.startDate) return "The end date cannot be before the start date.";
  }
  return null;
}

export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);
}
