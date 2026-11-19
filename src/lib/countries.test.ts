import { describe, expect, it } from "vitest";
import { COUNTRIES, UN_MEMBER_TOTAL } from "./country-catalog";
import {
  cleanNote, comparePartition, countrySearchKey, countryStats, needsRemoveConfirm, fillsForCompare, fillsForMarks,
  fillsForUnion, NOTE_MAX, parseYear, resolveSelection,
} from "./countries";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

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

describe("resolveSelection", () => {
  const all = [A, B, C];
  it("defaults to the viewer's own person", () => {
    expect(resolveSelection({ personIds: [], family: false, viewerPersonId: A, allPersonIds: all }))
      .toEqual({ mode: "single", personId: A });
  });
  it("falls back to the family when the viewer has no person", () => {
    expect(resolveSelection({ personIds: [], family: false, viewerPersonId: null, allPersonIds: all }))
      .toEqual({ mode: "union", personIds: all });
  });
  it("family wins over a person list", () => {
    expect(resolveSelection({ personIds: [A], family: true, viewerPersonId: A, allPersonIds: all }))
      .toEqual({ mode: "union", personIds: all });
  });
  it("two people compare, three union", () => {
    expect(resolveSelection({ personIds: [B, A], family: false, viewerPersonId: A, allPersonIds: all }))
      .toEqual({ mode: "compare", a: B, b: A });
    expect(resolveSelection({ personIds: [A, B, C], family: false, viewerPersonId: A, allPersonIds: all }))
      .toEqual({ mode: "union", personIds: [A, B, C] });
  });
  it("drops unknown people, then applies the rules to what is left", () => {
    const gone = "44444444-4444-4444-8444-444444444444";
    expect(resolveSelection({ personIds: [gone, B], family: false, viewerPersonId: A, allPersonIds: all }))
      .toEqual({ mode: "single", personId: B });
    expect(resolveSelection({ personIds: [gone], family: false, viewerPersonId: A, allPersonIds: all }))
      .toEqual({ mode: "single", personId: A });
  });
});

describe("compare and fills", () => {
  it("partitions", () => {
    expect(comparePartition(["208", "578"], ["578", "752"]))
      .toEqual({ onlyA: ["208"], onlyB: ["752"], both: ["578"] });
  });
  it("fills for one person skip dismissed", () => {
    expect(fillsForMarks([
      { countryKey: "208", status: "visited", year: null },
      { countryKey: "392", status: "wishlist", year: null },
      { countryKey: "752", status: "dismissed", year: null },
    ])).toEqual({ "208": "visited", "392": "wishlist" });
  });
  it("fills for compare and union", () => {
    expect(fillsForCompare(["208", "578"], ["578"])).toEqual({ "208": "onlyA", "578": "both" });
    expect(fillsForUnion(["208", "208"])).toEqual({ "208": "visited" });
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
