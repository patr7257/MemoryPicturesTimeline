import { describe, expect, it } from "vitest";

import type { PersonFacts, Viewer } from "./access-policy";
import {
  CANNOT_SHARE,
  SHARE_OUTSIDE,
  TAG_OUTSIDE,
  TRIP_NOT_FOUND,
  cleanIdList,
  decideShares,
  decideTags,
  groupShareTargets,
  groupState,
  mergeByName,
  shareTargetsFrom,
} from "./share-rules";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const FAM_A = id(901);
const FAM_B = id(902);
const ME = id(1); // in A
const SIS = id(2); // in A
const COUSIN = id(3); // in B
const LONER = id(4); // in no family

const facts = (...list: PersonFacts[]) => new Map(list.map((f) => [f.id, f]));
const ALL = facts(
  { id: ME, familyIds: [FAM_A] },
  { id: SIS, familyIds: [FAM_A] },
  { id: COUSIN, familyIds: [FAM_B] },
  { id: LONER, familyIds: [] },
);

const member: Viewer = {
  userId: "u-me",
  email: "me@example.com",
  name: "Me",
  role: "member",
  personId: ME,
  familyIds: [FAM_A],
};
const admin: Viewer = { ...member, userId: "u-admin", role: "super_admin", personId: null, familyIds: [] };
const loner: Viewer = { ...member, userId: "u-loner", personId: LONER, familyIds: [] };

const mine = { createdBy: "u-me", personIds: [] as string[] };

describe("cleanIdList", () => {
  it("dedupes uuids", () => {
    expect(cleanIdList([SIS, SIS, ME])).toEqual([SIS, ME]);
  });
  it("refuses a non uuid or a non array", () => {
    expect(cleanIdList([SIS, "1; drop table"])).toBeNull();
    expect(cleanIdList("x")).toBeNull();
    expect(cleanIdList(undefined)).toBeNull();
  });
});

describe("decideShares", () => {
  it("an invisible vacation gets the generic refusal before anything else", () => {
    expect(decideShares(member, { trip: null, current: [], ticked: ["junk"], facts: ALL })).toEqual({
      ok: false,
      error: TRIP_NOT_FOUND,
    });
  });

  it("someone it was only shared with cannot share it on", () => {
    const trip = { createdBy: "u-other", personIds: [COUSIN] };
    expect(decideShares(member, { trip, current: [ME], ticked: [SIS], facts: ALL })).toEqual({
      ok: false,
      error: CANNOT_SHARE,
    });
  });

  it("a tagged person may share with their own family", () => {
    const trip = { createdBy: "u-other", personIds: [ME] };
    expect(decideShares(member, { trip, current: [], ticked: [SIS], facts: ALL })).toEqual({
      ok: true,
      add: [SIS],
      remove: [],
    });
  });

  it("refuses a person in another family, even for the creator", () => {
    expect(decideShares(member, { trip: mine, current: [], ticked: [SIS, COUSIN], facts: ALL })).toEqual({
      ok: false,
      error: SHARE_OUTSIDE,
    });
  });

  it("refuses an unknown id and a malformed id", () => {
    expect(decideShares(member, { trip: mine, current: [], ticked: [id(77)], facts: ALL })).toEqual({
      ok: false,
      error: SHARE_OUTSIDE,
    });
    expect(decideShares(member, { trip: mine, current: [], ticked: ["nope"], facts: ALL })).toEqual({
      ok: false,
      error: SHARE_OUTSIDE,
    });
  });

  it("refuses sharing with the viewer's own person", () => {
    expect(decideShares(member, { trip: mine, current: [], ticked: [ME], facts: ALL })).toEqual({
      ok: false,
      error: SHARE_OUTSIDE,
    });
  });

  it("never removes a share another family made, ticked or not", () => {
    const trip = { createdBy: "u-other", personIds: [ME, COUSIN] };
    expect(decideShares(member, { trip, current: [COUSIN, SIS], ticked: [], facts: ALL })).toEqual({
      ok: true,
      add: [],
      remove: [SIS],
    });
    expect(decideShares(member, { trip, current: [COUSIN], ticked: [COUSIN], facts: ALL })).toEqual({
      ok: true,
      add: [],
      remove: [],
    });
  });

  it("a super admin may share with anyone", () => {
    const trip = { createdBy: "u-x", personIds: [] };
    expect(decideShares(admin, { trip, current: [], ticked: [COUSIN, LONER], facts: ALL })).toEqual({
      ok: true,
      add: [COUSIN, LONER],
      remove: [],
    });
  });
});

describe("shareTargetsFrom", () => {
  const visible = [{ id: ME }, { id: SIS }, { id: COUSIN }, { id: LONER }];
  it("a member: own family without themselves", () => {
    expect(shareTargetsFrom(member, visible, ALL).map((p) => p.id)).toEqual([SIS]);
  });
  it("a person in no family has nobody", () => {
    expect(shareTargetsFrom(loner, visible, ALL)).toEqual([]);
  });
  it("a super admin: everyone known", () => {
    expect(shareTargetsFrom(admin, visible, ALL).map((p) => p.id)).toEqual([ME, SIS, COUSIN, LONER]);
  });
  it("a person without facts is no target", () => {
    expect(shareTargetsFrom(admin, [{ id: id(55) }], ALL)).toEqual([]);
  });
});

describe("decideTags", () => {
  it("a member tags people in their families", () => {
    expect(decideTags(member, { current: [], next: [ME, SIS, SIS], facts: ALL })).toEqual({
      ok: true,
      next: [ME, SIS],
    });
  });
  it("refuses a new tag outside their families", () => {
    expect(decideTags(member, { current: [], next: [ME, COUSIN], facts: ALL })).toEqual({
      ok: false,
      error: TAG_OUTSIDE,
    });
  });
  it("keeps a person already tagged, and allows removing them", () => {
    expect(decideTags(member, { current: [COUSIN], next: [COUSIN, SIS], facts: ALL })).toEqual({
      ok: true,
      next: [COUSIN, SIS],
    });
    expect(decideTags(member, { current: [COUSIN, SIS], next: [SIS], facts: ALL })).toEqual({
      ok: true,
      next: [SIS],
    });
  });
  it("refuses an unknown id and a malformed one", () => {
    expect(decideTags(member, { current: [], next: [id(99)], facts: ALL })).toEqual({ ok: false, error: TAG_OUTSIDE });
    expect(decideTags(member, { current: [], next: ["x"], facts: ALL })).toEqual({ ok: false, error: TAG_OUTSIDE });
  });
  it("a person in no family can tag only themselves", () => {
    expect(decideTags(loner, { current: [], next: [LONER], facts: ALL }).ok).toBe(true);
    expect(decideTags(loner, { current: [], next: [SIS], facts: ALL }).ok).toBe(false);
  });
  it("a super admin tags anyone", () => {
    expect(decideTags(admin, { current: [], next: [SIS, COUSIN, LONER], facts: ALL }).ok).toBe(true);
  });
});

describe("groupShareTargets", () => {
  const p = (pid: string, name: string) => ({ id: pid, name, color: null });
  const anna = p(id(10), "Anna");
  const bo = p(id(11), "Bo");
  const cy = p(id(12), "Cy");
  const solo = p(id(13), "Solo");
  const fam = (fid: string, name: string, memberIds: string[]) => ({ id: fid, name, memberIds });

  it("puts a person in two families under both, sorted by name", () => {
    const groups = groupShareTargets(
      [cy, bo, anna],
      [fam(FAM_B, "Zed", [cy.id, anna.id]), fam(FAM_A, "Alpha", [bo.id, anna.id])],
    );
    expect(groups.map((g) => [g.name, g.people.map((x) => x.name)])).toEqual([
      ["Alpha", ["Anna", "Bo"]],
      ["Zed", ["Anna", "Cy"]],
    ]);
    expect(groups.map((g) => g.id)).toEqual([FAM_A, FAM_B]);
  });

  it("leaves out a family with no allowed target, and never lists a non target", () => {
    const groups = groupShareTargets([anna], [fam(FAM_A, "Alpha", [anna.id, bo.id]), fam(FAM_B, "Zed", [bo.id])]);
    expect(groups).toHaveLength(1);
    expect(groups[0].people.map((x) => x.id)).toEqual([anna.id]);
  });

  it("targets outside every family land last in No family", () => {
    const groups = groupShareTargets([solo, anna], [fam(FAM_A, "Alpha", [anna.id])]);
    expect(groups.map((g) => g.id)).toEqual([FAM_A, null]);
    expect(groups[1]).toMatchObject({ name: "No family", people: [solo] });
  });

  it("no No family group when every target has a family; empty in, empty out", () => {
    expect(groupShareTargets([anna], [fam(FAM_A, "Alpha", [anna.id])]).some((g) => g.id === null)).toBe(false);
    expect(groupShareTargets([], [fam(FAM_A, "Alpha", [anna.id])])).toEqual([]);
  });
});

describe("groupState", () => {
  const ids = ["a", "b"];
  it("none, some and all ticked", () => {
    expect(groupState(ids, [])).toBe("none");
    expect(groupState(ids, ["b", "x"])).toBe("some");
    expect(groupState(ids, ["a", "b", "x"])).toBe("all");
  });
});

describe("mergeByName", () => {
  it("adds the already tagged once and sorts by name", () => {
    const a = [{ id: SIS, name: "Sis" }, { id: ME, name: "Anna" }];
    const b = [{ id: COUSIN, name: "Bo" }, { id: SIS, name: "Sis" }];
    expect(mergeByName(a, b).map((p) => p.name)).toEqual(["Anna", "Bo", "Sis"]);
  });
});
