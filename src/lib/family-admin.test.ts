import { describe, expect, it } from "vitest";

import {
  cleanFamilyName,
  cleanIds,
  isUuid,
  initialFamilyTab,
  invitePersonId,
  peopleWithoutFamily,
  NO_FAMILY,
  defaultFilter,
  filterForPerson,
  initialFilter,
  loginsForFilter,
  peopleForFilter,
  planSubmit,
  resolveFilter,
  submitLabel,
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

const F1 = "f1111111-1111-4111-8111-111111111111";
const F2 = "f2222222-2222-4222-8222-222222222222";
const F3 = "f3333333-3333-4333-8333-333333333333";
const fams = [
  { id: F1, name: "Alpha", memberIds: [] as string[] },
  { id: F2, name: "Beta", memberIds: [P1] },
  { id: F3, name: "Gamma", memberIds: [P2] },
];
const ppl = [
  { id: P1, familyIds: [F2] },
  { id: P2, familyIds: [F2, F3] },
  { id: "p3", familyIds: [] as string[] },
];

describe("peopleForFilter", () => {
  it("shows one family's people, or the people in no family", () => {
    expect(peopleForFilter(ppl, F2).map((p) => p.id)).toEqual([P1, P2]);
    expect(peopleForFilter(ppl, F3).map((p) => p.id)).toEqual([P2]);
    expect(peopleForFilter(ppl, NO_FAMILY).map((p) => p.id)).toEqual(["p3"]);
    expect(peopleForFilter(ppl, F1)).toEqual([]);
  });
});

describe("defaultFilter and resolveFilter", () => {
  it("defaults to the first family that has people", () => {
    expect(defaultFilter(fams, ppl)).toBe(F2);
  });
  it("falls back to the first family, then to no family", () => {
    expect(defaultFilter(fams, [])).toBe(F1);
    expect(defaultFilter([], ppl)).toBe(NO_FAMILY);
  });
  it("accepts only a known family id or none", () => {
    expect(resolveFilter(F3, fams)).toBe(F3);
    expect(resolveFilter(NO_FAMILY, fams)).toBe(NO_FAMILY);
    expect(resolveFilter("nope", fams)).toBeNull();
    expect(resolveFilter(null, fams)).toBeNull();
  });
});

describe("initialFilter and filterForPerson", () => {
  it("uses the URL value when valid, else the default", () => {
    expect(initialFilter({ raw: F3, invitePerson: null, people: ppl, families: fams })).toBe(F3);
    expect(initialFilter({ raw: "x", invitePerson: null, people: ppl, families: fams })).toBe(F2);
  });
  it("an invited person moves the filter to one of their families", () => {
    expect(initialFilter({ raw: F1, invitePerson: P2, people: ppl, families: fams })).toBe(F2);
    expect(initialFilter({ raw: F3, invitePerson: P2, people: ppl, families: fams })).toBe(F3);
    expect(initialFilter({ raw: null, invitePerson: "p3", people: ppl, families: fams })).toBe(
      NO_FAMILY,
    );
  });
  it("keeps the current filter when it already shows the person", () => {
    expect(filterForPerson(ppl[1], F3)).toBe(F3);
    expect(filterForPerson(ppl[1], F1)).toBe(F2);
    expect(filterForPerson(ppl[2], F1)).toBe(NO_FAMILY);
  });
});

describe("loginsForFilter", () => {
  const logins = [
    { kind: "member", personId: P1 },
    { kind: "member", personId: "p3" },
    { kind: "config_super_admin" },
  ] as const;
  it("shows member logins of the visible people, env-only logins under no family", () => {
    expect(loginsForFilter(logins, new Set([P1]), F2)).toEqual([logins[0]]);
    expect(loginsForFilter(logins, new Set(["p3"]), NO_FAMILY)).toEqual([logins[1], logins[2]]);
  });
});

describe("planSubmit and submitLabel", () => {
  const base = {
    who: "new" as const,
    name: "Ann",
    personId: "",
    familyIds: [F1],
    currentFamilyIds: [] as string[],
    email: "",
  };
  it("someone new without email only adds", () => {
    expect(planSubmit(base)).toEqual({ ok: true, steps: ["addPerson"] });
    expect(submitLabel(base)).toBe("Add person");
  });
  it("someone new with email adds then invites", () => {
    const s = { ...base, email: " a@b.dk " };
    expect(planSubmit(s)).toEqual({ ok: true, steps: ["addPerson", "inviteMember"] });
    expect(submitLabel(s)).toBe("Add and invite");
  });
  it("someone new needs a name", () => {
    expect(planSubmit({ ...base, name: "  " })).toEqual({ ok: false, reason: "name" });
  });
  const ex = { ...base, who: "existing" as const, personId: P1, currentFamilyIds: [F1] };
  it("someone already here with email invites, saving changed families first", () => {
    const same = { ...ex, email: "a@b.dk" };
    expect(planSubmit(same)).toEqual({ ok: true, steps: ["inviteMember"] });
    expect(submitLabel(same)).toBe("Invite");
    const changed = { ...same, familyIds: [F1, F2] };
    expect(planSubmit(changed)).toEqual({
      ok: true,
      steps: ["setPersonFamilies", "inviteMember"],
    });
  });
  it("someone already here without email only saves changed families", () => {
    expect(planSubmit(ex)).toEqual({ ok: false, reason: "nothing" });
    const changed = { ...ex, familyIds: [] };
    expect(planSubmit(changed)).toEqual({ ok: true, steps: ["setPersonFamilies"] });
    expect(submitLabel(changed)).toBe("Save families");
  });
  it("someone already here needs a person", () => {
    expect(planSubmit({ ...ex, personId: "" })).toEqual({ ok: false, reason: "person" });
  });
});
