import { describe, expect, it } from "vitest";

import {
  canAdminister,
  canDeleteComment,
  canManagePhoto,
  canManageTrip,
  canSeeTrip,
  loginAllowed,
  parseEmailList,
  resolveRole,
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
