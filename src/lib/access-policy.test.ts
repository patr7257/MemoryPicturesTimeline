import { describe, expect, it } from "vitest";

import {
  canAdminister,
  canDeleteComment,
  canManagePhoto,
  canEditCountries,
  canManageTrip,
  canReadCountryNotes,
  canSeeTrip,
  countriesTier,
  loginAllowed,
  parseEmailList,
  resolveRole,
  tierColumns,
  tierReadsNote,
  tierStatuses,
  type Viewer,
} from "./access-policy";

const viewer = (over: Partial<Viewer> = {}): Viewer => ({
  userId: "u-kid",
  email: "kid@example.com",
  name: "Kid",
  role: "member",
  personId: "p-kid",
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
  const trip = { createdBy: "u-mom", personIds: ["p-mom", "p-kid"] };
  it("super admin sees everything", () => {
    expect(canSeeTrip(admin, { createdBy: null, personIds: [] })).toBe(true);
  });
  it("creator sees their own trip even when not tagged", () => {
    expect(canSeeTrip(viewer({ userId: "u-mom", personId: null }), { createdBy: "u-mom", personIds: [] })).toBe(true);
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
    expect(canSeeTrip(viewer({ personId: null }), { createdBy: null, personIds: [] })).toBe(false);
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
  const owner: Viewer = { userId: "u1", email: "a@x.dk", name: "A", role: "member", personId: P };
  const other: Viewer = { userId: "u2", email: "b@x.dk", name: "B", role: "member", personId: "person-2" };
  const admin: Viewer = { userId: "u3", email: "c@x.dk", name: "C", role: "super_admin", personId: "person-3" };
  const noPerson: Viewer = { userId: "u4", email: "d@x.dk", name: "D", role: "member", personId: null };

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
