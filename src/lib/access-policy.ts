// Who may see and do what. Pure functions, no I/O, unit-tested: every page,
// action and API route decides through these so the rules live in one place.
//
// The rules (Patrick's decision):
// - Families: a person belongs to zero or more families. A viewer sees a
//   person when they are a super admin, it is their own person, or the two
//   share at least one family. A person in no family sees only themselves; a
//   login without a person sees nobody.
// - A vacation, its photos and its comments are visible to: super admins, the
//   member who created it, members whose person is tagged on it, and members
//   whose person it is shared with. To everyone else it does not exist.
// - Sharing: a super admin, the creator or a tagged person may share a
//   vacation, with people in their own families (a super admin: anyone).
//   Someone it was shared with cannot share it on. Saving shares never removes
//   a share the saver could not have made.
// - Any member creates vacations and tags people while doing so. Details,
//   tags and deletion belong to the creator and super admins. Tag targets are
//   the people the viewer sees, plus people already tagged, who stay.
// - Anyone who sees a vacation may upload to it and comment on it.
// - A photo is deleted or captioned by its uploader or a super admin.
// - A comment is deleted by its author or a super admin.
// - People: creating, renaming, deleting, colours, inviting, roles and
//   removal are super admin only.
// - Countries: a viewer sees the visited countries of the people they see. A
//   map is edited by the person it belongs to or a super admin.
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
  // The families of that person (family_people). Empty without a person.
  familyIds: string[];
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

export type PersonFacts = { id: string; familyIds: readonly string[] };

const sharesFamily = (a: readonly string[], b: readonly string[]): boolean => a.some((id) => b.includes(id));

// Super admin, the viewer's own person, or a person sharing a family.
export function canSeePerson(v: Viewer, p: PersonFacts): boolean {
  if (isSuperAdmin(v)) return true;
  if (v.personId === null) return false;
  return v.personId === p.id || sharesFamily(v.familyIds, p.familyIds);
}

export type TripAccessFacts = {
  createdBy: string | null;
  personIds: readonly string[];
  sharedPersonIds: readonly string[];
};

// Ids arrive from URLs and forms. One that is not a uuid can match no row,
// and handing it to Postgres would throw instead of finding nothing.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: unknown): id is string => typeof id === "string" && UUID.test(id);

export function canSeeTrip(v: Viewer, trip: TripAccessFacts): boolean {
  if (isSuperAdmin(v)) return true;
  if (trip.createdBy !== null && trip.createdBy === v.userId) return true;
  if (v.personId === null) return false;
  return trip.personIds.includes(v.personId) || trip.sharedPersonIds.includes(v.personId);
}

// Shares are not consulted: someone a vacation was shared with cannot share it on.
export function canShareTrip(v: Viewer, trip: { createdBy: string | null; personIds: readonly string[] }): boolean {
  if (isSuperAdmin(v)) return true;
  if (trip.createdBy !== null && trip.createdBy === v.userId) return true;
  return v.personId !== null && trip.personIds.includes(v.personId);
}

// Share targets: people in the sharer's own families (a super admin: anyone).
export function canShareWith(v: Viewer, target: PersonFacts): boolean {
  return isSuperAdmin(v) || sharesFamily(v.familyIds, target.familyIds);
}

export type ShareChangePlan = { ok: true; add: string[]; remove: string[] } | { ok: false; refused: string[] };

// Pickable = known in targets and canShareWith. Any newly ticked id that is
// not pickable refuses the whole save. A current share that is not pickable
// was made by someone else (another family): it is never removed, and ticking
// it again changes nothing. The caller checks canShareTrip first; this only
// decides who may be picked.
export function planShareChange(
  v: Viewer,
  input: { current: readonly string[]; ticked: readonly string[]; targets: ReadonlyMap<string, PersonFacts> },
): ShareChangePlan {
  const pickable = (id: string): boolean => {
    const t = input.targets.get(id);
    return t !== undefined && canShareWith(v, t);
  };
  const ticked = Array.from(new Set(input.ticked));
  const refused = ticked.filter((id) => !pickable(id) && !input.current.includes(id));
  if (refused.length > 0) return { ok: false, refused };
  return {
    ok: true,
    add: ticked.filter((id) => !input.current.includes(id)),
    remove: input.current.filter((id) => pickable(id) && !ticked.includes(id)),
  };
}

// A person already tagged stays tagged; new tags only for people the viewer sees.
export function canTagPerson(v: Viewer, p: PersonFacts, alreadyTagged: boolean): boolean {
  return alreadyTagged || canSeePerson(v, p);
}

// Ids in next the viewer may not tag. An id missing from targets is refused
// unless it is already tagged.
export function refusedTags(
  v: Viewer,
  input: { current: readonly string[]; next: readonly string[]; targets: ReadonlyMap<string, PersonFacts> },
): string[] {
  return input.next.filter((id) => {
    const already = input.current.includes(id);
    const t = input.targets.get(id);
    if (t === undefined) return !already;
    return !canTagPerson(v, t, already);
  });
}

export type PeopleScope =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "families"; selfId: string; familyIds: readonly string[] };

// Which people a viewer's lists may contain; the SQL is built from this.
export function peopleScope(v: Viewer): PeopleScope {
  if (isSuperAdmin(v)) return { kind: "all" };
  if (v.personId === null) return { kind: "none" };
  return { kind: "families", selfId: v.personId, familyIds: v.familyIds };
}

// The trips a viewer sees, from the ids they created, are tagged on and were
// shared with.
export function visibleTripIdsFrom(
  v: Viewer,
  facts: { created: readonly string[]; tagged: readonly string[]; shared: readonly string[] },
): "all" | Set<string> {
  if (isSuperAdmin(v)) return "all";
  return new Set([...facts.created, ...facts.tagged, ...facts.shared]);
}

// Emails of everyone who sees a vacation, apart from its creator: env super
// admins, super_admin rows, and members whose person is tagged or shared.
export function audienceEmails(input: {
  trip: { personIds: readonly string[]; sharedPersonIds: readonly string[] };
  members: readonly { email: string; role: string; personId: string }[];
  env: Record<string, string | undefined>;
}): Set<string> {
  const emails = new Set<string>(superAdminEmails(input.env));
  for (const m of input.members) {
    if (
      m.role === "super_admin" ||
      input.trip.personIds.includes(m.personId) ||
      input.trip.sharedPersonIds.includes(m.personId)
    ) {
      emails.add(m.email);
    }
  }
  return emails;
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

// A viewer sees the visited countries of the people they see.
export const canSeeCountries = (v: Viewer, p: PersonFacts): boolean => canSeePerson(v, p);

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

export type CountryColumn = "countryKey" | "status" | "year" | "note";

// The columns a tier may select. The query builds its select from this list,
// so nothing else decides whether `note` is read.
export function tierColumns(tier: CountriesTier): readonly CountryColumn[] {
  return tier === "edit_notes" ? ["countryKey", "status", "year", "note"] : ["countryKey", "status", "year"];
}

export const tierReadsNote = (tier: CountriesTier): boolean => tierColumns(tier).includes("note");

export class AccessError extends Error {
  constructor(message = "Not allowed") {
    super(message);
    this.name = "AccessError";
  }
}
