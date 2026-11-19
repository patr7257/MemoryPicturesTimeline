// Who may see and do what. Pure functions, no I/O, unit-tested: every page,
// action and API route decides through these so the rules live in one place.
//
// The rules (Patrick's decision):
// - A vacation, its photos and its comments are visible to: super admins, the
//   member who created it, and members whose person is tagged on it. To
//   everyone else it does not exist.
// - Any member creates vacations and tags people while doing so. Details,
//   tags and deletion belong to the creator and super admins.
// - Anyone who sees a vacation may upload to it and comment on it.
// - A photo is deleted or captioned by its uploader or a super admin.
// - A comment is deleted by its author or a super admin.
// - People: every member sees the list and may add a person. Renaming,
//   deleting, inviting, roles and removal are super admin only.
// - Countries: every member sees every person's visited countries. A map is
//   edited by the person it belongs to or a super admin.
// - Country notes: a person with a login is the only one who reads and writes
//   their notes. For a person without a login, super admins do.
// - The wishlist and dismissed suggestions are private to whoever may edit
//   the map.

export type Role = "member" | "super_admin";

export type Viewer = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  // The person this login is tied to (members.person_id). Null for a login
  // that is allowed only through the env lists and has no member row yet.
  personId: string | null;
};

type Env = Record<string, string | undefined>;

export function parseEmailList(value: string | undefined): string[] {
  return (value ?? "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Bootstrap super admins: they keep access even with an empty members table.
export const superAdminEmails = (env: Env): string[] => parseEmailList(env.SUPER_ADMIN_EMAILS);

// Legacy allowlist, kept as a fallback so nobody is locked out by the move to
// in-app invites.
export const legacyFamilyEmails = (env: Env): string[] => parseEmailList(env.FAMILY_EMAILS);

export function resolveRole(email: string, memberRole: string | null | undefined, env: Env): Role {
  if (superAdminEmails(env).includes(email.toLowerCase())) return "super_admin";
  return memberRole === "super_admin" ? "super_admin" : "member";
}

// May this email receive a magic link? invitedEmails are the members rows.
export function loginAllowed(email: string, invitedEmails: string[], env: Env): boolean {
  const e = email.toLowerCase();
  return (
    invitedEmails.includes(e) ||
    superAdminEmails(env).includes(e) ||
    legacyFamilyEmails(env).includes(e)
  );
}

export const isSuperAdmin = (v: Viewer): boolean => v.role === "super_admin";

export type TripAccessFacts = { createdBy: string | null; personIds: readonly string[] };

export function canSeeTrip(v: Viewer, trip: TripAccessFacts): boolean {
  if (isSuperAdmin(v)) return true;
  if (trip.createdBy !== null && trip.createdBy === v.userId) return true;
  return v.personId !== null && trip.personIds.includes(v.personId);
}

// Edit details, change tags, delete.
export function canManageTrip(v: Viewer, trip: { createdBy: string | null }): boolean {
  return isSuperAdmin(v) || (trip.createdBy !== null && trip.createdBy === v.userId);
}

// Delete the photo or edit its caption. Seeing the trip is checked separately.
export function canManagePhoto(v: Viewer, photo: { uploaderId: string }): boolean {
  return isSuperAdmin(v) || photo.uploaderId === v.userId;
}

export function canDeleteComment(v: Viewer, comment: { authorId: string }): boolean {
  return isSuperAdmin(v) || comment.authorId === v.userId;
}

// Rename or delete people, invite members, set roles, remove members.
export const canAdminister = isSuperAdmin;

export type CountriesPerson = { id: string; hasLogin: boolean };

// Every signed-in viewer sees every person's visited countries.
export const canSeeCountries = (_v: Viewer): boolean => true;

// A map is edited by the person it belongs to or a super admin.
export function canEditCountries(v: Viewer, personId: string): boolean {
  return isSuperAdmin(v) || (v.personId !== null && v.personId === personId);
}

// A person with a login keeps their notes to themselves, super admins
// included. A person without a login has notes kept by the super admins.
export function canReadCountryNotes(v: Viewer, person: CountriesPerson): boolean {
  if (v.personId !== null && v.personId === person.id) return true;
  return !person.hasLogin && isSuperAdmin(v);
}

export type CountriesTier = "view" | "edit" | "edit_notes";

export function countriesTier(v: Viewer, person: CountriesPerson): CountriesTier {
  if (!canEditCountries(v, person.id)) return "view";
  return canReadCountryNotes(v, person) ? "edit_notes" : "edit";
}

// What a tier may read. The queries build from these, so a tier can never
// select more than this.
export function tierStatuses(tier: CountriesTier): readonly ("visited" | "wishlist" | "dismissed")[] {
  return tier === "view" ? ["visited"] : ["visited", "wishlist", "dismissed"];
}

export const tierReadsNote = (tier: CountriesTier): boolean => tier === "edit_notes";

export class AccessError extends Error {
  constructor(message = "Not allowed") {
    super(message);
    this.name = "AccessError";
  }
}
