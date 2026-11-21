// Pure helpers for the /family admin page: name validation, which tab opens,
// the invite deep link and the list of people in no family. No I/O.

export const FAMILY_NAME_MAX = 60;

export function cleanFamilyName(
  raw: unknown,
): { ok: true; name: string } | { ok: false; error: string } {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) return { ok: false, error: "Enter a family name" };
  if (name.length > FAMILY_NAME_MAX) {
    return { ok: false, error: `Keep the name to ${FAMILY_NAME_MAX} characters or fewer` };
  }
  return { ok: true, name };
}

export type FamilyTab = "families" | "people";

// An explicit hash wins; otherwise an invite link opens People.
export function initialFamilyTab(hash: string, hasInvite: boolean): FamilyTab {
  if (hash === "#people") return "people";
  if (hash === "#families") return "families";
  return hasInvite ? "people" : "families";
}

// ?invite=<personId>: the first value, only when it names a known person.
export function invitePersonId(
  raw: string | string[] | undefined,
  personIds: readonly string[],
): string | null {
  const wanted = Array.isArray(raw) ? raw[0] : raw;
  return wanted !== undefined && personIds.includes(wanted) ? wanted : null;
}

export function peopleWithoutFamily(
  people: readonly { id: string; familyIds: readonly string[] }[],
): string[] {
  return people.filter((p) => p.familyIds.length === 0).map((p) => p.id);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ids arrive from forms; a malformed one would make Postgres reject the query.
export const isUuid = (x: unknown): x is string => typeof x === "string" && UUID.test(x);

// A de-duplicated list of ids, or null when any entry is not a uuid.
export function cleanIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (!raw.every(isUuid)) return null;
  return Array.from(new Set(raw as string[]));
}
