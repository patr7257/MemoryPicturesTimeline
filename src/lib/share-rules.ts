// Decisions for tagging and sharing a vacation, in the order the actions must
// take them. Pure: the actions load the facts and apply the result, so every
// refusal path is unit tested here. The rules themselves live in
// access-policy.ts; this file only sequences them and picks the messages.
import {
  canShareTrip,
  canShareWith,
  isUuid,
  planShareChange,
  refusedTags,
  type PersonFacts,
  type Viewer,
} from "./access-policy";

export const TRIP_NOT_FOUND = "This vacation was not found.";
export const CANNOT_SHARE = "You cannot share this vacation.";
export const SHARE_OUTSIDE = "You can only share with people in your families.";
export const TAG_OUTSIDE = "You can only tag people in your families.";
export const NEEDS_SOMEONE = "A vacation needs at least one person.";

// A vacation always has at least one person tagged: true when this tag list
// would leave it with nobody.
export function needsSomeone(personIds: readonly string[]): boolean {
  return personIds.length === 0;
}

// The vacations that would be left with nobody tagged once `personId` is
// gone: those whose only tagged person (duplicates ignored) is that person.
export function tripsOnlyTagging(
  personId: string,
  tagsByTrip: readonly { tripId: string; personIds: readonly string[] }[],
): string[] {
  return tagsByTrip
    .filter((t) => {
      const ids = new Set(t.personIds);
      return ids.size === 1 && ids.has(personId);
    })
    .map((t) => t.tripId);
}

type Refusal = { ok: false; error: string };

// Ids from the client: deduplicated, or null when the value is not an array
// of uuids (a malformed id must never reach SQL).
export function cleanIdList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (!raw.every(isUuid)) return null;
  return Array.from(new Set(raw as string[]));
}

// Someone the viewer may pick in the share dialog: never their own person.
export function isShareTarget(v: Viewer, facts: PersonFacts | undefined): boolean {
  return facts !== undefined && facts.id !== v.personId && canShareWith(v, facts);
}

export function shareTargetsFrom<T extends { id: string }>(
  v: Viewer,
  visible: readonly T[],
  facts: ReadonlyMap<string, PersonFacts>,
): T[] {
  return visible.filter((p) => isShareTarget(v, facts.get(p.id)));
}

// setTripShares, in its fixed order: visible, may share, then who is picked.
export function decideShares(
  v: Viewer,
  input: {
    trip: { createdBy: string | null; personIds: readonly string[] } | null;
    current: readonly string[];
    ticked: unknown;
    facts: ReadonlyMap<string, PersonFacts>;
  },
): { ok: true; add: string[]; remove: string[] } | Refusal {
  if (input.trip === null) return { ok: false, error: TRIP_NOT_FOUND };
  if (!canShareTrip(v, input.trip)) return { ok: false, error: CANNOT_SHARE };
  const ticked = cleanIdList(input.ticked);
  if (ticked === null) return { ok: false, error: SHARE_OUTSIDE };
  const targets = new Map<string, PersonFacts>();
  for (const [id, f] of input.facts) if (isShareTarget(v, f)) targets.set(id, f);
  const plan = planShareChange(v, { current: input.current, ticked, targets });
  if (!plan.ok) return { ok: false, error: SHARE_OUTSIDE };
  return { ok: true, add: plan.add, remove: plan.remove };
}

// createTrip (current = []) and setTripPeople: the new tag list, or a refusal
// when it is empty or any new tag is someone the viewer may not tag.
export function decideTags(
  v: Viewer,
  input: { current: readonly string[]; next: unknown; facts: ReadonlyMap<string, PersonFacts> },
): { ok: true; next: string[] } | Refusal {
  const next = cleanIdList(input.next);
  if (next === null) return { ok: false, error: TAG_OUTSIDE };
  if (needsSomeone(next)) return { ok: false, error: NEEDS_SOMEONE };
  const refused = refusedTags(v, { current: input.current, next, targets: input.facts });
  if (refused.length > 0) return { ok: false, error: TAG_OUTSIDE };
  return { ok: true, next };
}

export type ShareGroup<T> = { id: string | null; name: string; people: T[] };

// The share dialog's groups: one per family that has at least one allowed
// target (families sorted by name), then "No family" for targets in none of
// the given families. Only people in `targets` ever appear, so the allowed set
// is never widened; a person in two families appears under both.
export function groupShareTargets<T extends { id: string; name: string }>(
  targets: readonly T[],
  families: readonly { id: string; name: string; memberIds: readonly string[] }[],
): ShareGroup<T>[] {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const allowed = new Map(targets.map((t) => [t.id, t]));
  const listed = new Set<string>();
  const groups: ShareGroup<T>[] = [];
  for (const f of [...families].sort(byName)) {
    const people: T[] = [];
    for (const pid of new Set(f.memberIds)) {
      const t = allowed.get(pid);
      if (t) {
        people.push(t);
        listed.add(pid);
      }
    }
    if (people.length > 0) groups.push({ id: f.id, name: f.name, people: people.sort(byName) });
  }
  const rest = targets.filter((t) => !listed.has(t.id)).sort(byName);
  if (rest.length > 0) groups.push({ id: null, name: "No family", people: rest });
  return groups;
}

// Tri-state of a family row from the ticked set.
export function groupState(personIds: readonly string[], ticked: readonly string[]): "none" | "some" | "all" {
  const on = personIds.filter((id) => ticked.includes(id)).length;
  if (on === 0) return "none";
  return on === personIds.length ? "all" : "some";
}

// Tap on a family chip: a fully on family turns all its people off, anything
// else (none or some on) turns all of them on. Order kept, no duplicates.
export function toggleFamily(ticked: readonly string[], personIds: readonly string[]): string[] {
  if (groupState(personIds, ticked) === "all") {
    const drop = new Set(personIds);
    return ticked.filter((id) => !drop.has(id));
  }
  const have = new Set(ticked);
  return [...ticked, ...Array.from(new Set(personIds)).filter((id) => !have.has(id))];
}

// What a new vacation starts with: exactly one family means everyone of it who
// may be tagged; several (or no) families mean nothing until one is picked.
export function defaultFamilySelection(
  families: readonly { memberIds: readonly string[] }[],
  allowedIds: readonly string[],
): string[] {
  if (families.length !== 1) return [];
  const allowed = new Set(allowedIds);
  return Array.from(new Set(families[0].memberIds)).filter((id) => allowed.has(id));
}

// Who a new vacation starts tagged with: the default family selection, or,
// when that is empty (several families, or none), the viewer's own person
// when they have one and may be tagged.
export function initialTagged(
  families: readonly { memberIds: readonly string[] }[],
  allowedIds: readonly string[],
  viewerPersonId: string | null,
): string[] {
  const picked = defaultFamilySelection(families, allowedIds);
  if (picked.length > 0) return picked;
  return viewerPersonId !== null && allowedIds.includes(viewerPersonId) ? [viewerPersonId] : [];
}

// Ids that belong to none of the given families (the "Also on this vacation"
// group of the picker: already tagged, outside the viewer's families).
export function outsideFamilies(
  ids: readonly string[],
  families: readonly { memberIds: readonly string[] }[],
): string[] {
  const inside = new Set(families.flatMap((f) => f.memberIds));
  return ids.filter((id) => !inside.has(id));
}

// The visible people plus those already tagged (who stay), once each, by name.
export function mergeByName<T extends { id: string; name: string }>(a: readonly T[], b: readonly T[]): T[] {
  const out = new Map<string, T>();
  for (const p of [...a, ...b]) if (!out.has(p.id)) out.set(p.id, p);
  return Array.from(out.values()).sort((x, y) => x.name.localeCompare(y.name));
}
