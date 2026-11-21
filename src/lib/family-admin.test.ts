import { describe, expect, it } from "vitest";

import {
  cleanFamilyName,
  cleanIds,
  isUuid,
  initialFamilyTab,
  invitePersonId,
  peopleWithoutFamily,
} from "./family-admin";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

describe("cleanFamilyName", () => {
  it("trims a good name", () => {
    expect(cleanFamilyName("  Robel  ")).toEqual({ ok: true, name: "Robel" });
  });
  it("refuses empty, blank, non-string and too long names", () => {
    expect(cleanFamilyName("")).toEqual({ ok: false, error: "Enter a family name" });
    expect(cleanFamilyName("   ")).toEqual({ ok: false, error: "Enter a family name" });
    expect(cleanFamilyName(42)).toEqual({ ok: false, error: "Enter a family name" });
    expect(cleanFamilyName("x".repeat(61)).ok).toBe(false);
    expect(cleanFamilyName("x".repeat(60)).ok).toBe(true);
  });
});

describe("initialFamilyTab", () => {
  it("follows the hash, then the invite, then families", () => {
    expect(initialFamilyTab("#people", false)).toBe("people");
    expect(initialFamilyTab("", true)).toBe("people");
    expect(initialFamilyTab("#families", true)).toBe("families");
    expect(initialFamilyTab("", false)).toBe("families");
    expect(initialFamilyTab("#nonsense", false)).toBe("families");
  });
});

describe("invitePersonId", () => {
  it("accepts only a known person, first value wins", () => {
    expect(invitePersonId(P1, [P1, P2])).toBe(P1);
    expect(invitePersonId([P2, P1], [P1, P2])).toBe(P2);
    expect(invitePersonId("nope", [P1])).toBeNull();
    expect(invitePersonId(undefined, [P1])).toBeNull();
  });
});

describe("isUuid and cleanIds", () => {
  it("accepts uuids only", () => {
    expect(isUuid(P1)).toBe(true);
    expect(isUuid("nope")).toBe(false);
    expect(isUuid(5)).toBe(false);
  });
  it("de-duplicates, and refuses anything that is not a list of uuids", () => {
    expect(cleanIds([P1, P2, P1])).toEqual([P1, P2]);
    expect(cleanIds([P1, "x"])).toBeNull();
    expect(cleanIds("x")).toBeNull();
    expect(cleanIds([])).toEqual([]);
  });
});

describe("peopleWithoutFamily", () => {
  it("lists people in no family", () => {
    expect(
      peopleWithoutFamily([
        { id: "a", familyIds: [] },
        { id: "b", familyIds: ["f"] },
      ]),
    ).toEqual(["a"]);
  });
});
