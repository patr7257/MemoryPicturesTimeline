// Pure helpers for member management: validation, status derivation, merging
// member rows with the env-configured logins, and the self-lockout rule.
// No I/O, unit-tested in members.test.ts.
import { legacyFamilyEmails, superAdminEmails, type Role } from "./access-policy";

type Env = Record<string, string | undefined>;

export const normalizeEmail = (value: string): string => (value ?? "").trim().toLowerCase();

// Deliberately simple: one @, no spaces, a dot in the domain. The mail
// provider is the real validator.
export function isValidEmail(value: string): boolean {
  const e = normalizeEmail(value);
  if (e.length > 254) return false;
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(e);
}

export function parseRole(value: unknown): Role | null {
  return value === "member" || value === "super_admin" ? value : null;
}

export type MemberStatus = "invited" | "active";

// Active once a Better Auth user row with the same email exists.
export function deriveStatus(hasUser: boolean): MemberStatus {
  return hasUser ? "active" : "invited";
}

// A super admin may not remove or demote the member row of their own email:
// that is how an accidental self-lockout happens.
export function isSelfLockout(
  viewerEmail: string,
  memberEmail: string,
  change: { type: "remove" } | { type: "role"; role: Role },
): boolean {
  if (normalizeEmail(viewerEmail) !== normalizeEmail(memberEmail)) return false;
  return change.type === "remove" || change.role !== "super_admin";
}

// The invitation mail points at the login page, never at a magic link.
export function buildLoginUrl(baseUrl: string | undefined): string | null {
  const base = (baseUrl ?? "").trim().replace(/\/+$/, "");
  return base ? `${base}/login` : null;
}

export type MemberInput = {
  id: string;
  email: string;
  role: string;
  personId: string;
  personName: string;
};

export type ConfigLoginKind = "config_super_admin" | "config_legacy";

export type LoginEntry =
  | {
      kind: "member";
      id: string;
      email: string;
      role: Role;
      personId: string;
      personName: string;
      status: MemberStatus;
      passkeyCount: number;
    }
  | { kind: ConfigLoginKind; email: string; status: MemberStatus; passkeyCount: number };

// Members first (as given), then env logins that have no member row.
// userEmails: lowercase emails with a Better Auth user row.
export function mergeLogins(
  memberRows: readonly MemberInput[],
  userEmails: ReadonlySet<string>,
  passkeyCounts: ReadonlyMap<string, number>,
  env: Env,
): LoginEntry[] {
  const out: LoginEntry[] = [];
  const seen = new Set<string>();
  for (const m of memberRows) {
    const email = normalizeEmail(m.email);
    seen.add(email);
    out.push({
      kind: "member",
      id: m.id,
      email,
      role: m.role === "super_admin" ? "super_admin" : "member",
      personId: m.personId,
      personName: m.personName,
      status: deriveStatus(userEmails.has(email)),
      passkeyCount: passkeyCounts.get(email) ?? 0,
    });
  }
  const add = (email: string, kind: ConfigLoginKind) => {
    if (seen.has(email)) return;
    seen.add(email);
    out.push({
      kind,
      email,
      status: deriveStatus(userEmails.has(email)),
      passkeyCount: passkeyCounts.get(email) ?? 0,
    });
  };
  for (const e of superAdminEmails(env)) add(e, "config_super_admin");
  for (const e of legacyFamilyEmails(env)) add(e, "config_legacy");
  return out;
}
