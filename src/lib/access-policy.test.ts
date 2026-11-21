import { describe, expect, it } from "vitest";

import {
  audienceEmails,
  canAdminister,
  canDeleteComment,
  canManagePhoto,
  canEditCountries,
  canManageTrip,
  canReadCountryNotes,
  canSeeCountries,
  canSeePerson,
  canSeeTrip,
  canShareTrip,
  canShareWith,
  canTagPerson,
  countriesTier,
  loginAllowed,
  parseEmailList,
  peopleScope,
  isUuid,
  planShareChange,
  refusedTags,
  resolveRole,
  tierColumns,
  tierReadsNote,
  tierStatuses,
  visibleTripIdsFrom,
  type PersonFacts,
  type Viewer,
} from "./access-policy";

const viewer = (over: Partial<Viewer> = {}): Viewer => ({
  userId: "u-kid",
  email: "kid@example.com",
  name: "Kid",
  role: "member",
  personId: "p-kid",
  familyIds: [],
  ...over,
});

const admin = viewer({ userId: "u-admin", email: "admin@example.com", role: "super_admin", personId: null });

describe("parseEmailList", () => {
  it("lowercases, trims and drops empties", () => {
    expect(parseEmailList(" A@b.c, ,d@E.f ,")).toEqual(["a@b.c", "d@e.f"]);
    expect(parseEmailList(undefined)).toEqual([]);
  });
});

describe("resolveRole", () => {
  const env = { SUPER_ADMIN_EMAILS: "Admin@Example.com" };
  it("env super admin wins without a member row, case-insensitive", () => {
    expect(resolveRole("admin@example.com", null, env)).toBe("super_admin");
    expect(resolveRole("ADMIN@example.com", "member", env)).toBe("super_admin");
  });
  it("member row role is used otherwise", () => {
    expect(resolveRole("kid@example.com", "super_admin", env)).toBe("super_admin");
    expect(resolveRole("kid@example.com", "member", env)).toBe("member");
  });
  it("unknown role strings and missing rows fall back to member", () => {
    expect(resolveRole("kid@example.com", "owner", env)).toBe("member");
    expect(resolveRole("kid@example.com", undefined, {})).toBe("member");
  });
});

describe("loginAllowed", () => {
  const env = { SUPER_ADMIN_EMAILS: "admin@example.com", FAMILY_EMAILS: "old@example.com" };
  it("allows invited members, env super admins and the legacy list", () => {
    expect(loginAllowed("Kid@Example.com", ["kid@example.com"], env)).toBe(true);
    expect(loginAllowed("admin@example.com", [], env)).toBe(true);
    expect(loginAllowed("old@example.com", [], env)).toBe(true);
  });
  it("rejects everyone else, also with empty env", () => {
    expect(loginAllowed("stranger@example.com", ["kid@example.com"], env)).toBe(false);
    expect(loginAllowed("stranger@example.com", [], {})).toBe(false);
  });
});

describe("canSeeTrip", () => {
  const trip = { createdBy: "u-mom", personIds: ["p-mom", "p-kid"], sharedPersonIds: [] as string[] };
  it("super admin sees everything", () => {
    expect(canSeeTrip(admin, { createdBy: null, personIds: [], sharedPersonIds: [] })).toBe(true);
  });
  it("creator sees their own trip even when not tagged", () => {
    expect(canSeeTrip(viewer({ userId: "u-mom", personId: null }), { createdBy: "u-mom", personIds: [], sharedPersonIds: [] })).toBe(true);
  });
  it("tagged member sees it", () => {
    expect(canSeeTrip(viewer(), trip)).toBe(true);
  });
  it("untagged member does not", () => {
    expect(canSeeTrip(viewer({ userId: "u-dad", personId: "p-dad" }), trip)).toBe(false);
  });
  it("a login without a person sees only what it created", () => {
    expect(canSeeTrip(viewer({ personId: null }), trip)).toBe(false);
  });
  it("a trip without a creator never matches a member by null", () => {
    expect(canSeeTrip(viewer({ personId: null }), { createdBy: null, personIds: [], sharedPersonIds: [] })).toBe(false);
  });
});

describe("manage rules", () => {
  it("trip: creator or super admin, not a tagged member", () => {
    expect(canManageTrip(viewer({ userId: "u-mom" }), { createdBy: "u-mom" })).toBe(true);
    expect(canManageTrip(admin, { createdBy: "u-mom" })).toBe(true);
    expect(canManageTrip(viewer(), { createdBy: "u-mom" })).toBe(false);
    expect(canManageTrip(viewer(), { createdBy: null })).toBe(false);
  });
  it("photo: uploader or super admin", () => {
    expect(canManagePhoto(viewer(), { uploaderId: "u-kid" })).toBe(true);
    expect(canManagePhoto(admin, { uploaderId: "u-kid" })).toBe(true);
    expect(canManagePhoto(viewer(), { uploaderId: "u-mom" })).toBe(false);
  });
  it("comment: author or super admin", () => {
    expect(canDeleteComment(viewer(), { authorId: "u-kid" })).toBe(true);
    expect(canDeleteComment(admin, { authorId: "u-kid" })).toBe(true);
    expect(canDeleteComment(viewer(), { authorId: "u-mom" })).toBe(false);
  });
  it("administration is super admin only", () => {
    expect(canAdminister(admin)).toBe(true);
    expect(canAdminister(viewer())).toBe(false);
  });
});

describe("countries", () => {
  const P = "person-1";
  const owner: Viewer = { userId: "u1", email: "a@x.dk", name: "A", role: "member", personId: P, familyIds: [] };
  const other: Viewer = { userId: "u2", email: "b@x.dk", name: "B", role: "member", personId: "person-2", familyIds: [] };
  const admin: Viewer = { userId: "u3", email: "c@x.dk", name: "C", role: "super_admin", personId: "person-3", familyIds: [] };
  const noPerson: Viewer = { userId: "u4", email: "d@x.dk", name: "D", role: "member", personId: null, familyIds: [] };

  it("who may edit", () => {
    expect(canEditCountries(owner, P)).toBe(true);
    expect(canEditCountries(admin, P)).toBe(true);
    expect(canEditCountries(other, P)).toBe(false);
    expect(canEditCountries(noPerson, P)).toBe(false);
  });
  it("who may read notes", () => {
    expect(canReadCountryNotes(owner, { id: P, hasLogin: true })).toBe(true);
    expect(canReadCountryNotes(admin, { id: P, hasLogin: true })).toBe(false);
    expect(canReadCountryNotes(admin, { id: P, hasLogin: false })).toBe(true);
    expect(canReadCountryNotes(other, { id: P, hasLogin: false })).toBe(false);
    expect(canReadCountryNotes(admin, { id: "person-3", hasLogin: true })).toBe(true);
  });
  it("tiers", () => {
    expect(countriesTier(other, { id: P, hasLogin: true })).toBe("view");
    expect(countriesTier(admin, { id: P, hasLogin: true })).toBe("edit");
    expect(countriesTier(admin, { id: P, hasLogin: false })).toBe("edit_notes");
    expect(countriesTier(owner, { id: P, hasLogin: true })).toBe("edit_notes");
  });
  it("what a tier reads", () => {
    expect(tierStatuses("view")).toEqual(["visited"]);
    expect(tierStatuses("edit")).toEqual(["visited", "wishlist", "dismissed"]);
    expect(tierStatuses("edit_notes")).toEqual(["visited", "wishlist", "dismissed"]);
    expect(tierReadsNote("view")).toBe(false);
    expect(tierReadsNote("edit")).toBe(false);
    expect(tierReadsNote("edit_notes")).toBe(true);
  });
});

describe("tierColumns", () => {
  it("selects the note only for the tier that may read it", () => {
    expect(tierColumns("view")).toEqual(["countryKey", "status", "year"]);
    expect(tierColumns("edit")).toEqual(["countryKey", "status", "year"]);
    expect(tierColumns("edit_notes")).toEqual(["countryKey", "status", "year", "note"]);
  });
  it("agrees with tierReadsNote for every tier", () => {
    for (const tier of ["view", "edit", "edit_notes"] as const) {
      expect(tierColumns(tier).includes("note")).toBe(tierReadsNote(tier));
    }
  });
});

describe("families, shares and tags", () => {
  const ann: PersonFacts = { id: "pAnn", familyIds: ["fA", "fB"] };
  const bo_: PersonFacts = { id: "pBo", familyIds: ["fB"] };
  const cy: PersonFacts = { id: "pCy", familyIds: ["fA"] };
  const lone_: PersonFacts = { id: "pLone", familyIds: [] };
  const bo = viewer({ userId: "u-bo", personId: "pBo", familyIds: ["fB"] });
  const lone = viewer({ userId: "u-lone", personId: "pLone", familyIds: [] });
  const noPerson = viewer({ userId: "u-none", personId: null, familyIds: [] });
  const admin = viewer({ userId: "u-root", role: "super_admin", personId: null, familyIds: [] });
  const targets = new Map([
    ["pAnn", ann],
    ["pCy", cy],
  ]);

  it("canSeePerson: super admin, self, or a shared family", () => {
    expect(canSeePerson(admin, cy)).toBe(true);
    expect(canSeePerson(bo, bo_)).toBe(true); // self
    expect(canSeePerson(bo, ann)).toBe(true); // shared family fB
    expect(canSeePerson(bo, cy)).toBe(false); // other family
  });
  it("canSeePerson: no family means self only, no person means nobody", () => {
    expect(canSeePerson(lone, lone_)).toBe(true);
    expect(canSeePerson(lone, ann)).toBe(false);
    expect(canSeePerson(noPerson, ann)).toBe(false);
  });
  it("canSeeCountries follows canSeePerson", () => {
    expect(canSeeCountries(bo, cy)).toBe(false);
    expect(canSeeCountries(bo, ann)).toBe(true);
  });
  it("canSeeTrip: a share makes it visible", () => {
    const trip = { createdBy: "u-x", personIds: ["pCy"], sharedPersonIds: [] as string[] };
    expect(canSeeTrip(bo, trip)).toBe(false);
    expect(canSeeTrip(bo, { ...trip, sharedPersonIds: ["pBo"] })).toBe(true);
    expect(canSeeTrip(noPerson, { ...trip, sharedPersonIds: ["pBo"] })).toBe(false);
  });
  it("canShareTrip: tagged, creator or super admin; shared-with cannot share on", () => {
    expect(canShareTrip(bo, { createdBy: "u-x", personIds: ["pBo"] })).toBe(true); // tagged
    expect(canShareTrip(bo, { createdBy: "u-x", personIds: ["pCy"] })).toBe(false);
    expect(canShareTrip(bo, { createdBy: "u-bo", personIds: [] })).toBe(true); // creator
    expect(canShareTrip(admin, { createdBy: null, personIds: [] })).toBe(true);
    expect(canShareTrip(noPerson, { createdBy: null, personIds: [] })).toBe(false);
  });
  it("canShareWith: only people in the sharer's own families", () => {
    expect(canShareWith(bo, ann)).toBe(true);
    expect(canShareWith(bo, cy)).toBe(false);
    expect(canShareWith(lone, ann)).toBe(false);
    expect(canShareWith(admin, cy)).toBe(true);
  });
  it("planShareChange never removes a share the viewer could not have made", () => {
    expect(planShareChange(bo, { current: ["pCy"], ticked: ["pAnn"], targets })).toEqual({
      ok: true,
      add: ["pAnn"],
      remove: [],
    }); // pCy (other family) untouched
    expect(planShareChange(bo, { current: ["pAnn", "pCy"], ticked: [], targets })).toEqual({
      ok: true,
      add: [],
      remove: ["pAnn"],
    });
  });
  it("isUuid accepts a uuid and nothing else", () => {
    expect(isUuid("3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b")).toBe(true);
    expect(isUuid("3F2B8C1E-5A4D-4E6F-9A1B-2C3D4E5F6A7B")).toBe(true);
    expect(isUuid("abc")).toBe(false);
    expect(isUuid("3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b'; --")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });

  it("a share with someone else does not open the vacation", () => {
    const trip = { createdBy: "u-x", personIds: ["pCy"], sharedPersonIds: ["pAnn"] };
    expect(canSeeTrip(bo, trip)).toBe(false);
  });

  it("planShareChange ignores duplicates and a kept share the viewer could not have made", () => {
    expect(planShareChange(bo, { current: [], ticked: ["pAnn", "pAnn"], targets })).toEqual({
      ok: true,
      add: ["pAnn"],
      remove: [],
    });
    // pCy was shared by the other family; posting it back ticked is not a refusal.
    expect(planShareChange(bo, { current: ["pCy"], ticked: ["pCy", "pAnn"], targets })).toEqual({
      ok: true,
      add: ["pAnn"],
      remove: [],
    });
  });

  it("planShareChange refuses the whole save on any target that is not pickable", () => {
    expect(planShareChange(bo, { current: [], ticked: ["pCy"], targets })).toEqual({ ok: false, refused: ["pCy"] });
    expect(planShareChange(bo, { current: [], ticked: ["pAnn", "pZed"], targets })).toEqual({
      ok: false,
      refused: ["pZed"],
    }); // unknown id
    expect(planShareChange(admin, { current: [], ticked: ["pCy"], targets })).toEqual({
      ok: true,
      add: ["pCy"],
      remove: [],
    });
  });
  it("canTagPerson: people the viewer sees, and anyone already tagged", () => {
    expect(canTagPerson(lone, lone_, false)).toBe(true);
    expect(canTagPerson(lone, ann, false)).toBe(false);
    expect(canTagPerson(bo, cy, true)).toBe(true); // already tagged stays
  });
  it("refusedTags: unseen new tags and unknown ids are refused, kept tags are not", () => {
    expect(refusedTags(bo, { current: ["pCy"], next: ["pCy", "pAnn", "pZed"], targets })).toEqual(["pZed"]);
    expect(refusedTags(bo, { current: [], next: ["pCy"], targets })).toEqual(["pCy"]);
    expect(refusedTags(bo, { current: ["pZed"], next: ["pZed"], targets })).toEqual([]);
  });
  it("peopleScope", () => {
    expect(peopleScope(admin)).toEqual({ kind: "all" });
    expect(peopleScope(noPerson)).toEqual({ kind: "none" });
    expect(peopleScope(lone)).toEqual({ kind: "families", selfId: "pLone", familyIds: [] });
    expect(peopleScope(bo)).toEqual({ kind: "families", selfId: "pBo", familyIds: ["fB"] });
  });
  it("visibleTripIdsFrom: created, tagged and shared, deduplicated", () => {
    expect(visibleTripIdsFrom(admin, { created: [], tagged: [], shared: [] })).toBe("all");
    expect(visibleTripIdsFrom(bo, { created: ["t1"], tagged: ["t2"], shared: ["t3", "t1"] })).toEqual(
      new Set(["t1", "t2", "t3"]),
    );
  });
  it("audienceEmails: env super admins, super_admin rows, tagged and shared", () => {
    expect(
      audienceEmails({
        trip: { personIds: ["pCy"], sharedPersonIds: ["pBo"] },
        members: [
          { email: "bo@x.dk", role: "member", personId: "pBo" },
          { email: "cy@x.dk", role: "member", personId: "pCy" },
          { email: "ann@x.dk", role: "member", personId: "pAnn" },
          { email: "boss@x.dk", role: "super_admin", personId: "pAnn" },
        ],
        env: { SUPER_ADMIN_EMAILS: "Root@x.dk" },
      }),
    ).toEqual(new Set(["root@x.dk", "bo@x.dk", "cy@x.dk", "boss@x.dk"]));
  });
});
