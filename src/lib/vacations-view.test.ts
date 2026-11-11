import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIEW_STATE,
  applyViewState,
  availableYears,
  computeStats,
  draftError,
  emptyDraft,
  sameIds,
  toggleId,
  filterVacations,
  formatYearSpan,
  hasActiveFilters,
  lengthInDays,
  matchesQuery,
  parseViewState,
  serializeViewState,
  sortVacations,
  type VacationItem,
} from "./vacations-view";

const trip = (over: Partial<VacationItem> & { id: string }): VacationItem => ({
  title: "Trip",
  description: null,
  startDate: "2020-07-01",
  endDate: null,
  locationName: null,
  people: [],
  photoCount: 0,
  ...over,
});

const anna = { id: "p-anna", name: "Anna" };
const ben = { id: "p-ben", name: "Ben" };

const italy = trip({
  id: "t1",
  title: "Summer in Italy",
  description: "Lake Garda with the cousins",
  locationName: "Lake Garda, Italy",
  startDate: "2019-07-12",
  endDate: "2019-07-19",
  people: [anna, ben],
  photoCount: 40,
});
const alps = trip({
  id: "t2",
  title: "Ski week",
  locationName: "Les Arcs",
  startDate: "2021-02-13",
  people: [anna],
  photoCount: 12,
});
const nye = trip({
  id: "t3",
  title: "New year in Côte d'Azur",
  locationName: "Nice",
  startDate: "2019-12-28",
  endDate: "2020-01-03",
  people: [ben],
  photoCount: 12,
});
const all = [italy, alps, nye];

describe("parseViewState", () => {
  it("returns the defaults for an empty query string", () => {
    expect(parseViewState(new URLSearchParams(""))).toEqual(DEFAULT_VIEW_STATE);
  });

  it("reads every known param", () => {
    const state = parseViewState(
      new URLSearchParams("q=  garda &person=p-anna&year=2019&sort=photos&view=cards"),
    );
    expect(state).toEqual({ q: "garda", person: "p-anna", year: 2019, sort: "photos", view: "cards" });
  });

  it("falls back to defaults for unknown or malformed values", () => {
    const state = parseViewState(
      new URLSearchParams("year=20x9&sort=sideways&view=grid&person=" + "x".repeat(200)),
    );
    expect(state).toEqual(DEFAULT_VIEW_STATE);
    expect(parseViewState(new URLSearchParams("year=-2019")).year).toBeNull();
    expect(parseViewState(new URLSearchParams("year=19")).year).toBeNull();
  });

  it("caps the search text length", () => {
    expect(parseViewState(new URLSearchParams({ q: "a".repeat(500) })).q).toHaveLength(100);
  });
});

describe("serializeViewState", () => {
  it("omits defaults", () => {
    expect(serializeViewState(DEFAULT_VIEW_STATE)).toBe("");
  });

  it("round-trips a full state", () => {
    const state = { q: "garda lake", person: "p-anna", year: 2019, sort: "title", view: "cards" } as const;
    expect(parseViewState(new URLSearchParams(serializeViewState(state)))).toEqual(state);
  });

  it("encodes special characters safely", () => {
    const state = { ...DEFAULT_VIEW_STATE, q: "a&b=c ø" };
    expect(parseViewState(new URLSearchParams(serializeViewState(state))).q).toBe("a&b=c ø");
  });

  it("drops a whitespace-only search", () => {
    expect(serializeViewState({ ...DEFAULT_VIEW_STATE, q: "   " })).toBe("");
  });
});

describe("hasActiveFilters", () => {
  it("ignores sort and view, counts search, person and year", () => {
    expect(hasActiveFilters({ ...DEFAULT_VIEW_STATE, sort: "title", view: "cards" })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_VIEW_STATE, q: "x" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_VIEW_STATE, person: "p" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_VIEW_STATE, year: 2019 })).toBe(true);
  });
});

describe("matchesQuery", () => {
  it("matches title, place and notes, case and accent insensitive", () => {
    expect(matchesQuery(italy, "ITALY")).toBe(true);
    expect(matchesQuery(italy, "cousins")).toBe(true);
    expect(matchesQuery(alps, "les arcs")).toBe(true);
    expect(matchesQuery(nye, "cote d'azur")).toBe(true);
    expect(matchesQuery(italy, "norway")).toBe(false);
  });

  it("requires every term, in any order", () => {
    expect(matchesQuery(italy, "garda summer")).toBe(true);
    expect(matchesQuery(italy, "garda norway")).toBe(false);
  });

  it("treats an empty query as match-all", () => {
    expect(matchesQuery(italy, "   ")).toBe(true);
  });
});

describe("filterVacations", () => {
  it("filters by person", () => {
    expect(filterVacations(all, { q: "", person: "p-anna", year: null }).map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("filters by start year", () => {
    expect(filterVacations(all, { q: "", person: null, year: 2019 }).map((t) => t.id)).toEqual(["t1", "t3"]);
  });

  it("combines filters", () => {
    expect(filterVacations(all, { q: "year", person: "p-ben", year: 2019 }).map((t) => t.id)).toEqual(["t3"]);
    expect(filterVacations(all, { q: "", person: "p-nobody", year: null })).toEqual([]);
  });
});

describe("availableYears", () => {
  it("lists distinct start years, newest first", () => {
    expect(availableYears(all)).toEqual([2021, 2019]);
    expect(availableYears([])).toEqual([]);
  });
});

describe("sortVacations", () => {
  it("sorts newest and oldest first without mutating the input", () => {
    const input = [...all];
    expect(sortVacations(input, "newest").map((t) => t.id)).toEqual(["t2", "t3", "t1"]);
    expect(sortVacations(input, "oldest").map((t) => t.id)).toEqual(["t1", "t3", "t2"]);
    expect(input.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("sorts by photo count and breaks ties by newest start date", () => {
    // t2 and t3 both have 12 photos; t2 started later so it comes first.
    expect(sortVacations(all, "photos").map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("sorts by title ignoring case", () => {
    const mixed = [trip({ id: "b", title: "beach" }), trip({ id: "a", title: "Alps" }), trip({ id: "c", title: "Canoe" })];
    expect(sortVacations(mixed, "title").map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("is deterministic for identical sort keys: falls through to title, then id", () => {
    const twins = [
      trip({ id: "z", title: "Same", startDate: "2020-01-01" }),
      trip({ id: "a", title: "Same", startDate: "2020-01-01" }),
      trip({ id: "m", title: "Other", startDate: "2020-01-01" }),
    ];
    const forward = sortVacations(twins, "newest").map((t) => t.id);
    const backward = sortVacations([...twins].reverse(), "newest").map((t) => t.id);
    expect(forward).toEqual(["m", "a", "z"]);
    expect(backward).toEqual(forward);
  });
});

describe("applyViewState", () => {
  it("filters, then sorts", () => {
    const state = { ...DEFAULT_VIEW_STATE, person: "p-ben", sort: "oldest" } as const;
    expect(applyViewState(all, state).map((t) => t.id)).toEqual(["t1", "t3"]);
  });
});

describe("lengthInDays", () => {
  it("counts a missing or same-day end as one day", () => {
    expect(lengthInDays("2020-07-01", null)).toBe(1);
    expect(lengthInDays("2020-07-01", "2020-07-01")).toBe(1);
  });

  it("counts inclusively within a month", () => {
    expect(lengthInDays("2019-07-12", "2019-07-19")).toBe(8);
  });

  it("crosses month and year boundaries", () => {
    expect(lengthInDays("2019-12-28", "2020-01-03")).toBe(7);
    expect(lengthInDays("2020-02-27", "2020-03-02")).toBe(5); // leap year
    expect(lengthInDays("2021-02-27", "2021-03-02")).toBe(4);
  });

  it("is not thrown by daylight saving changes", () => {
    expect(lengthInDays("2021-03-27", "2021-03-29")).toBe(3);
    expect(lengthInDays("2021-10-30", "2021-11-01")).toBe(3);
  });

  it("treats an end before the start as one day", () => {
    expect(lengthInDays("2020-07-10", "2020-07-01")).toBe(1);
  });
});

describe("computeStats", () => {
  it("summarises count, photos, years and distinct places", () => {
    const withDuplicatePlace = [...all, trip({ id: "t4", startDate: "2022-05-01", locationName: " nice ", photoCount: 3 })];
    expect(computeStats(withDuplicatePlace)).toEqual({
      count: 4,
      photos: 67,
      firstYear: 2019,
      lastYear: 2022,
      places: 3, // Garda, Les Arcs, Nice (" nice " counts once)
    });
  });

  it("handles an empty list", () => {
    expect(computeStats([])).toEqual({ count: 0, photos: 0, firstYear: null, lastYear: null, places: 0 });
  });

  it("ignores blank places", () => {
    expect(computeStats([trip({ id: "a", locationName: "  " }), trip({ id: "b" })]).places).toBe(0);
  });
});

describe("formatYearSpan", () => {
  it("formats none, one year and a range", () => {
    expect(formatYearSpan({ firstYear: null, lastYear: null })).toBe("none");
    expect(formatYearSpan({ firstYear: 2020, lastYear: 2020 })).toBe("2020");
    expect(formatYearSpan({ firstYear: 2019, lastYear: 2022 })).toBe("2019 to 2022");
  });
});

describe("draft helpers", () => {
  it("preselects the creator's person only when there is one", () => {
    expect(emptyDraft("p-anna").personIds).toEqual(["p-anna"]);
    expect(emptyDraft(null).personIds).toEqual([]);
  });

  const valid = { ...emptyDraft(null), title: "Trip", startDate: "2020-07-01" };

  it("accepts a title and a start date", () => {
    expect(draftError(valid)).toBeNull();
    expect(draftError({ ...valid, endDate: "2020-07-01" })).toBeNull();
  });

  it("reports the first problem", () => {
    expect(draftError({ ...valid, title: "  " })).toMatch(/title/i);
    expect(draftError({ ...valid, startDate: "" })).toMatch(/start date/i);
    expect(draftError({ ...valid, endDate: "2020-06-30" })).toMatch(/before the start/i);
    expect(draftError({ ...valid, endDate: "soon" })).toMatch(/not a valid/i);
  });

  it("toggles ids without mutating", () => {
    const ids = ["a", "b"];
    expect(toggleId(ids, "c")).toEqual(["a", "b", "c"]);
    expect(toggleId(ids, "a")).toEqual(["b"]);
    expect(ids).toEqual(["a", "b"]);
  });

  it("compares id sets ignoring order", () => {
    expect(sameIds(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameIds(["a"], ["a", "b"])).toBe(false);
    expect(sameIds([], [])).toBe(true);
  });
});
