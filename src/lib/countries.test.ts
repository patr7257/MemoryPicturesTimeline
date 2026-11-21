import { describe, expect, it } from "vitest";
import { COUNTRIES, UN_MEMBER_TOTAL } from "./country-catalog";
import {
  applyMarkChange, markAfterStatus, legendFills, cleanNote, countrySearchKey, countryStats, currentYearIn, needsRemoveConfirm, fillsForMarks,
  fillsForPeople, multiStats, NOTE_MAX, parseYear, partitionVisitors, YEAR_ZONE,
} from "./countries";

describe("countryStats", () => {
  it("is all zeros for nobody", () => {
    const s = countryStats([]);
    expect(s).toMatchObject({ total: 0, unMembers: 0, unTotal: UN_MEMBER_TOTAL, percent: 0 });
    expect(s.continents.reduce((n, c) => n + c.total, 0)).toBe(COUNTRIES.length);
    expect(s.continents.every((c) => c.visited === 0)).toBe(true);
  });
  it("counts territories in total but not as UN members", () => {
    const s = countryStats(["208", "304", "234"]); // Denmark, Greenland, Faroe Islands
    expect(s.total).toBe(3);
    expect(s.unMembers).toBe(1);
    expect(s.percent).toBe(1);
  });
  it("ignores duplicates and unknown keys", () => {
    expect(countryStats(["208", "208", "nowhere"]).total).toBe(1);
  });
});

describe("currentYearIn", () => {
  it("turns the year at midnight in Copenhagen, not in UTC", () => {
    expect(currentYearIn(YEAR_ZONE, new Date("2026-12-31T22:59:00Z"))).toBe(2026);
    expect(currentYearIn(YEAR_ZONE, new Date("2026-12-31T23:00:00Z"))).toBe(2027);
  });
  it("uses the zone it is given", () => {
    expect(currentYearIn("UTC", new Date("2026-12-31T23:00:00Z"))).toBe(2026);
  });
});

describe("several people", () => {
  const byPerson = { ann: ["208", "578"], bo: ["208", "752"], cy: [] };
  it("lists the visitors of each country and the shared countries", () => {
    expect(partitionVisitors(byPerson)).toEqual({
      visitorsByKey: { "208": ["ann", "bo"], "578": ["ann"], "752": ["bo"] },
      sharedKeys: ["208"],
    });
  });
  it("counts a person once per country when a key repeats", () => {
    expect(partitionVisitors({ ann: ["208", "208"] })).toEqual({ visitorsByKey: { "208": ["ann"] }, sharedKeys: [] });
  });
  it("fills with the one visitor's colour, or the shared colour", () => {
    expect(fillsForPeople(byPerson, { ann: "#aa0000", bo: "#00bb00", cy: "#0000cc" }, "#999999"))
      .toEqual({ "208": "#999999", "578": "#aa0000", "752": "#00bb00" });
  });
  it("counts per person, shared and total", () => {
    expect(multiStats(byPerson)).toEqual({ perPerson: { ann: 2, bo: 2, cy: 0 }, shared: 1, total: 3 });
  });
});

describe("fillsForMarks", () => {
  it("skips dismissed", () => {
    expect(fillsForMarks([
      { countryKey: "208", status: "visited", year: null },
      { countryKey: "392", status: "wishlist", year: null },
      { countryKey: "752", status: "dismissed", year: null },
    ])).toEqual({ "208": "visited", "392": "wishlist" });
    expect(fillsForMarks([{ countryKey: "208", status: "visited", year: null }, { countryKey: "752", status: "dismissed", year: null }]))
      .toEqual({ "208": "visited" });
  });
});

describe("parseYear", () => {
  it("accepts a plain year and clears on empty", () => {
    expect(parseYear("2019", 2026)).toEqual({ ok: true, year: 2019 });
    expect(parseYear(2026, 2026)).toEqual({ ok: true, year: 2026 });
    expect(parseYear("", 2026)).toEqual({ ok: true, year: null });
    expect(parseYear(null, 2026)).toEqual({ ok: true, year: null });
  });
  it("refuses everything else", () => {
    for (const bad of ["abc", "1899", "2027", "2019.5", "20190", 2019.5, {}, " 2019x"]) {
      expect(parseYear(bad, 2026), String(bad)).toEqual({ ok: false });
    }
  });
});

describe("cleanNote", () => {
  it("trims, and blank becomes null", () => {
    expect(cleanNote("  hi  ")).toEqual({ ok: true, note: "hi" });
    expect(cleanNote("   ")).toEqual({ ok: true, note: null });
  });
  it("refuses too long and non-strings", () => {
    expect(cleanNote("x".repeat(NOTE_MAX))).toEqual({ ok: true, note: "x".repeat(NOTE_MAX) });
    expect(cleanNote("x".repeat(NOTE_MAX + 1))).toEqual({ ok: false });
    expect(cleanNote(5)).toEqual({ ok: false });
  });
});

describe("countrySearchKey", () => {
  it("lower-cases and strips diacritics", () => {
    expect(countrySearchKey("Côte d'Ivoire")).toBe("cote d'ivoire");
    expect(countrySearchKey("Réunion")).toBe("reunion");
    expect(countrySearchKey("CURAÇAO")).toBe("curacao");
  });
  it("folds the Nordic letters that NFD leaves alone", () => {
    expect(countrySearchKey("Åland")).toBe("aland");
    expect(countrySearchKey("Færøerne")).toBe("faeroerne");
    expect(countrySearchKey("ØSTRIG")).toBe("ostrig");
  });
  it("lets a plain query match an accented name", () => {
    expect(countrySearchKey("Côte d'Ivoire").includes(countrySearchKey("cote"))).toBe(true);
    expect(countrySearchKey("Åland").includes(countrySearchKey("ÅL"))).toBe(true);
  });
});

describe("needsRemoveConfirm", () => {
  it("asks when a year would be lost", () => {
    expect(needsRemoveConfirm({ countryKey: "208", status: "visited", year: 2019 })).toBe(true);
  });
  it("does not ask for a bare mark", () => {
    expect(needsRemoveConfirm({ countryKey: "208", status: "visited", year: null, note: null })).toBe(false);
  });
  it("asks for a wishlist entry with a note", () => {
    expect(needsRemoveConfirm({ countryKey: "208", status: "wishlist", year: null, note: "Fjords" })).toBe(true);
  });
  it("does not ask when the note was never read", () => {
    expect(needsRemoveConfirm({ countryKey: "208", status: "visited", year: null })).toBe(false);
  });
  it("treats an empty note as no note", () => {
    expect(needsRemoveConfirm({ countryKey: "208", status: "visited", year: null, note: "" })).toBe(false);
  });
});

describe("applyMarkChange", () => {
  const dk = { countryKey: "208", status: "visited" as const, year: 2019 };
  const no = { countryKey: "578", status: "wishlist" as const, year: null };
  it("adds, replaces and removes one mark", () => {
    expect(applyMarkChange([dk], { key: "578", mark: no })).toEqual([dk, no]);
    expect(applyMarkChange([dk, no], { key: "208", mark: { ...dk, year: 2021 } })).toEqual([no, { ...dk, year: 2021 }]);
    expect(applyMarkChange([dk, no], { key: "208", mark: null })).toEqual([no]);
  });
  it("never changes the array it is given", () => {
    const marks = [dk];
    applyMarkChange(marks, { key: "208", mark: null });
    expect(marks).toEqual([dk]);
  });
});

describe("markAfterStatus", () => {
  const visited = { countryKey: "208", status: "visited" as const, year: 2019, note: "Fjords" };
  it("keeps a visited year when visited is set without one, like the server", () => {
    expect(markAfterStatus(visited, "208", "visited")).toEqual(visited);
  });
  it("has no year for a new or wishlist country set visited without one", () => {
    expect(markAfterStatus(undefined, "208", "visited")).toEqual({ countryKey: "208", status: "visited", year: null });
    expect(markAfterStatus({ countryKey: "208", status: "wishlist", year: null }, "208", "visited")).toEqual({
      countryKey: "208",
      status: "visited",
      year: null,
    });
  });
  it("writes a given year, and an explicit null clears it", () => {
    expect(markAfterStatus(visited, "208", "visited", 2021).year).toBe(2021);
    expect(markAfterStatus(visited, "208", "visited", null).year).toBeNull();
  });
  it("drops the year for any other status and keeps a note the viewer has", () => {
    expect(markAfterStatus(visited, "208", "wishlist", 2021)).toEqual({ countryKey: "208", status: "wishlist", year: null, note: "Fjords" });
  });
});

describe("legendFills", () => {
  it("names each fill in use once, in a fixed order", () => {
    expect(legendFills({ "208": "wishlist", "578": "visited", "752": "visited" })).toEqual(["visited", "wishlist"]);
  });
  it("still has an entry when every fill is visited", () => {
    expect(legendFills({ "208": "visited" })).toEqual(["visited"]);
  });
  it("is empty without fills", () => {
    expect(legendFills({})).toEqual([]);
  });
});
