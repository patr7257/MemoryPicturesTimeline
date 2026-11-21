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

// ---------- People tab: family filter and the add-or-invite form ----------

// The filter is exactly one family id, or NO_FAMILY for people in none.
export const NO_FAMILY = "none";

type FilterPerson = { id: string; familyIds: readonly string[] };
type FilterFamily = { id: string; memberIds: readonly string[] };

export function peopleForFilter<T extends FilterPerson>(people: readonly T[], filter: string): T[] {
  return filter === NO_FAMILY
    ? people.filter((p) => p.familyIds.length === 0)
    : people.filter((p) => p.familyIds.includes(filter));
}

// The first family (they arrive sorted by name) that has people, else the
// first family, else the people in no family.
export function defaultFilter(
  families: readonly FilterFamily[],
  people: readonly FilterPerson[],
): string {
  const withPeople = families.find((f) => people.some((p) => p.familyIds.includes(f.id)));
  return (withPeople ?? families[0])?.id ?? NO_FAMILY;
}

// A filter value from the URL, only when it names a family or NO_FAMILY.
export function resolveFilter(
  raw: string | null | undefined,
  families: readonly { id: string }[],
): string | null {
  if (raw === NO_FAMILY) return NO_FAMILY;
  return raw && families.some((f) => f.id === raw) ? raw : null;
}

// Keeps the current filter when it already shows the person, else moves to
// one of their families (or NO_FAMILY).
export function filterForPerson(person: FilterPerson, current: string): string {
  if (peopleForFilter([person], current).length > 0) return current;
  return person.familyIds[0] ?? NO_FAMILY;
}

export function initialFilter(args: {
  raw: string | null | undefined;
  invitePerson: string | null;
  people: readonly FilterPerson[];
  families: readonly FilterFamily[];
}): string {
  const base = resolveFilter(args.raw, args.families) ?? defaultFilter(args.families, args.people);
  const invited = args.invitePerson ? args.people.find((p) => p.id === args.invitePerson) : null;
  return invited ? filterForPerson(invited, base) : base;
}

// Member logins follow their person; logins without a person (server config
// only) show under NO_FAMILY.
export function loginsForFilter<T extends { kind: string; personId?: string }>(
  logins: readonly T[],
  visiblePersonIds: ReadonlySet<string>,
  filter: string,
): T[] {
  return logins.filter((l) =>
    l.kind === "member" ? visiblePersonIds.has(l.personId ?? "") : filter === NO_FAMILY,
  );
}

export type SubmitStep = "addPerson" | "setPersonFamilies" | "inviteMember";

export type SubmitInput = {
  who: "new" | "existing";
  name: string;
  personId: string;
  familyIds: readonly string[];
  currentFamilyIds: readonly string[];
  email: string;
};

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

// Which server actions the form runs, in order. Each stops at the first refusal.
export function planSubmit(
  i: SubmitInput,
):
  | { ok: true; steps: SubmitStep[] }
  | { ok: false; reason: "name" | "person" | "nothing" } {
  const invite = i.email.trim().length > 0;
  if (i.who === "new") {
    if (!i.name.trim()) return { ok: false, reason: "name" };
    return { ok: true, steps: invite ? ["addPerson", "inviteMember"] : ["addPerson"] };
  }
  if (!i.personId) return { ok: false, reason: "person" };
  const steps: SubmitStep[] = [];
  if (!sameIds(i.familyIds, i.currentFamilyIds)) steps.push("setPersonFamilies");
  if (invite) steps.push("inviteMember");
  return steps.length > 0 ? { ok: true, steps } : { ok: false, reason: "nothing" };
}

export function submitLabel(i: Pick<SubmitInput, "who" | "email">): string {
  const invite = i.email.trim().length > 0;
  if (i.who === "new") return invite ? "Add and invite" : "Add person";
  return invite ? "Invite" : "Save families";
}
