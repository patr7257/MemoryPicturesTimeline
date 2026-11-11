import { describe, expect, it } from "vitest";

import {
  buildLoginUrl,
  deriveStatus,
  isSelfLockout,
  isValidEmail,
  mergeLogins,
  normalizeEmail,
  parseRole,
} from "./members";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Anna@Example.COM ")).toBe("anna@example.com");
  });
});

describe("isValidEmail", () => {
  it("accepts normal addresses, ignoring case and spaces", () => {
    expect(isValidEmail(" Anna@Example.com ")).toBe(true);
    expect(isValidEmail("a.b+c@sub.example.dk")).toBe(true);
  });
  it("rejects malformed addresses", () => {
    for (const bad of ["", "anna", "anna@", "@example.com", "anna@example", "a b@example.com", "a@@b.com", "a@b..com"]) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });
});

describe("parseRole", () => {
  it("accepts only the two roles", () => {
    expect(parseRole("member")).toBe("member");
    expect(parseRole("super_admin")).toBe("super_admin");
    expect(parseRole("admin")).toBeNull();
    expect(parseRole(undefined)).toBeNull();
  });
});

describe("deriveStatus", () => {
  it("is active once a user row exists", () => {
    expect(deriveStatus(true)).toBe("active");
    expect(deriveStatus(false)).toBe("invited");
  });
});

describe("isSelfLockout", () => {
  it("blocks removing your own row, case-insensitively", () => {
    expect(isSelfLockout("Me@x.dk", "me@x.dk", { type: "remove" })).toBe(true);
  });
  it("blocks demoting yourself but allows keeping super_admin", () => {
    expect(isSelfLockout("me@x.dk", "me@x.dk", { type: "role", role: "member" })).toBe(true);
    expect(isSelfLockout("me@x.dk", "me@x.dk", { type: "role", role: "super_admin" })).toBe(false);
  });
  it("never blocks changes to someone else", () => {
    expect(isSelfLockout("me@x.dk", "other@x.dk", { type: "remove" })).toBe(false);
    expect(isSelfLockout("me@x.dk", "other@x.dk", { type: "role", role: "member" })).toBe(false);
  });
});

describe("buildLoginUrl", () => {
  it("appends /login without doubling slashes", () => {
    expect(buildLoginUrl("https://memories.example.dk")).toBe("https://memories.example.dk/login");
    expect(buildLoginUrl("https://memories.example.dk//")).toBe("https://memories.example.dk/login");
  });
  it("is null when unset", () => {
    expect(buildLoginUrl(undefined)).toBeNull();
    expect(buildLoginUrl("  ")).toBeNull();
  });
});

describe("mergeLogins", () => {
  const rows = [
    { id: "1", email: "Anna@x.dk", role: "member", personId: "p1", personName: "Anna" },
    { id: "2", email: "boss@x.dk", role: "super_admin", personId: "p2", personName: "Boss" },
  ];
  const env = { SUPER_ADMIN_EMAILS: "boss@x.dk, root@x.dk", FAMILY_EMAILS: "old@x.dk,anna@x.dk,root@x.dk" };

  it("lists members first, with status and passkeys", () => {
    const out = mergeLogins(rows, new Set(["anna@x.dk"]), new Map([["anna@x.dk", 2]]), {});
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: "member", email: "anna@x.dk", status: "active", passkeyCount: 2 });
    expect(out[1]).toMatchObject({ kind: "member", status: "invited", passkeyCount: 0 });
  });

  it("adds env logins without a member row, super admin winning over legacy", () => {
    const out = mergeLogins(rows, new Set(["old@x.dk"]), new Map(), env);
    expect(out.map((e) => [e.kind, e.email])).toEqual([
      ["member", "anna@x.dk"],
      ["member", "boss@x.dk"],
      ["config_super_admin", "root@x.dk"],
      ["config_legacy", "old@x.dk"],
    ]);
    expect(out[3].status).toBe("active");
  });

  it("is empty with nothing configured", () => {
    expect(mergeLogins([], new Set(), new Map(), {})).toEqual([]);
  });
});
