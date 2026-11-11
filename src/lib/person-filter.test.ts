import { describe, expect, it } from "vitest";

import {
  MAX_PEOPLE_FILTER,
  matchesPeople,
  parsePersonParam,
  personQuery,
  togglePerson,
} from "./person-filter";

const A = "0b6f2ab8-6d5f-4ceb-a2f5-9f4f3f0b6a01";
const B = "0b6f2ab8-6d5f-4ceb-a2f5-9f4f3f0b6a02";
const C = "0b6f2ab8-6d5f-4ceb-a2f5-9f4f3f0b6a03";

describe("parsePersonParam", () => {
  it("treats a missing param as everyone", () => {
    expect(parsePersonParam(undefined)).toEqual([]);
  });

  it("keeps a single old-style param working", () => {
    expect(parsePersonParam(A)).toEqual([A]);
  });

  it("reads repeated params in order", () => {
    expect(parsePersonParam([B, A])).toEqual([B, A]);
  });

  it("drops values that are not uuids", () => {
    expect(parsePersonParam(["nope", A, "", "1; drop table"])).toEqual([A]);
  });

  it("dedupes, ignoring case and whitespace", () => {
    expect(parsePersonParam([A, A.toUpperCase(), ` ${A} `])).toEqual([A]);
  });

  it("caps the selection", () => {
    const many = Array.from(
      { length: MAX_PEOPLE_FILTER + 5 },
      (_, i) => `0b6f2ab8-6d5f-4ceb-a2f5-${String(i).padStart(12, "0")}`,
    );
    expect(parsePersonParam(many)).toHaveLength(MAX_PEOPLE_FILTER);
  });
});

describe("togglePerson", () => {
  it("adds an absent id at the end", () => {
    expect(togglePerson([A], B)).toEqual([A, B]);
  });

  it("removes a present id", () => {
    expect(togglePerson([A, B], A)).toEqual([B]);
  });

  it("does not mutate its input", () => {
    const sel = [A];
    togglePerson(sel, B);
    expect(sel).toEqual([A]);
  });

  it("does not grow past the cap", () => {
    const full = Array.from(
      { length: MAX_PEOPLE_FILTER },
      (_, i) => `0b6f2ab8-6d5f-4ceb-a2f5-${String(i).padStart(12, "0")}`,
    );
    expect(togglePerson(full, C)).toEqual(full);
  });
});

describe("personQuery", () => {
  it("is empty for no filter", () => {
    expect(personQuery([])).toEqual({});
  });

  it("uses an array even for one id", () => {
    expect(personQuery([A])).toEqual({ person: [A] });
  });

  it("repeats the param for several ids", () => {
    const q = personQuery([A, B]);
    expect(new URLSearchParams(q.person!.map((p) => ["person", p])).toString()).toBe(
      `person=${A}&person=${B}`,
    );
  });
});

describe("matchesPeople", () => {
  it("matches everything when nothing is selected", () => {
    expect(matchesPeople([], [])).toBe(true);
  });

  it("matches when ANY selected person is tagged", () => {
    expect(matchesPeople([A, B], [B, C])).toBe(true);
  });

  it("does not match when none is tagged", () => {
    expect(matchesPeople([A], [B, C])).toBe(false);
    expect(matchesPeople([A], [])).toBe(false);
  });
});
