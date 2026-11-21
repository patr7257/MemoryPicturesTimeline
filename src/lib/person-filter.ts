// The filter lives in the URL as repeated `family` and `person` params:
// ?family=<id>&person=<id>&person=<id>. A vacation matches when ANY effective
// person is tagged on it. `pick=none` means the viewer switched everything
// off explicitly; a bare URL means no filter. There is no "everyone" chip.
// One `person` param keeps working (old links).

export const MAX_PEOPLE_FILTER = 12;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PersonParam = string | string[] | undefined;

// Next searchParams give string | string[] | undefined for a repeated param.
// Keeps only uuid-shaped values, lower-cased, deduped in first-seen order,
// capped at MAX_PEOPLE_FILTER.
export function parsePersonParam(raw: PersonParam): string[] {
  return parseIds(raw, MAX_PEOPLE_FILTER);
}

export const MAX_FAMILY_FILTER = 12;

// Same rules as parsePersonParam, with its own cap.
export function parseFamilyParam(raw: PersonParam): string[] {
  return parseIds(raw, MAX_FAMILY_FILTER);
}

function parseIds(raw: PersonParam, cap: number): string[] {
  const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const value of list) {
    if (typeof value !== "string") continue;
    const id = value.trim().toLowerCase();
    if (!UUID.test(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= cap) break;
  }
  return out;
}

// Adds the id when absent, removes it when present. Never exceeds the cap
// (adding past the cap is a no-op) and never mutates the input.
export function togglePerson(selected: readonly string[], id: string): string[] {
  const key = id.toLowerCase();
  if (selected.includes(key)) return selected.filter((x) => x !== key);
  if (selected.length >= MAX_PEOPLE_FILTER) return [...selected];
  return [...selected, key];
}

// Query object for typedRoutes hrefs: { person: ["a", "b"] }, or {} for no
// filter. Always an array when set, so one id still serialises as ?person=a.
export function personQuery(ids: readonly string[]): { person?: string[] } {
  return ids.length === 0 ? {} : { person: [...ids] };
}

// Does a trip tagged with `tagged` match the selection? Empty = everyone.
export function matchesPeople(selected: readonly string[], tagged: readonly string[]): boolean {
  return selected.length === 0 || selected.some((id) => tagged.includes(id));
}

export type FilterFamily = { id: string; name: string; memberIds: readonly string[] };
export type FilterPerson = { id: string; name: string };
export type FilterSelection = { familyIds: string[]; personIds: string[] };
export type ResolvedFilter = {
  familyChips: FilterFamily[];
  nameChips: FilterPerson[];
  selection: FilterSelection;
  effective: string[] | null;
};

// Pure resolver: what the viewer may see (families, people) plus what the URL
// asked for gives the chips, the cleaned selection and the people to filter by.
// Ids the viewer cannot see are dropped, so a foreign id behaves as absent.
export function resolveFilter(input: {
  selection: FilterSelection;
  families: readonly FilterFamily[];
  people: readonly FilterPerson[];
}): ResolvedFilter {
  const { people } = input;
  // A family with no member the viewer can see (empty, or all hidden) has no
  // chip and cannot be selected: selecting it would leave nothing to pick.
  const known = new Set(people.map((p) => p.id));
  const families = input.families.filter((f) => f.memberIds.some((id) => known.has(id)));
  const selected = families.filter((f) => input.selection.familyIds.includes(f.id));
  const inSelected = new Set(selected.flatMap((f) => f.memberIds));
  const nameChips = selected.length === 0 ? [...people] : people.filter((p) => inSelected.has(p.id));
  const chipIds = new Set(nameChips.map((p) => p.id));
  const personIds = input.selection.personIds.filter((id) => chipIds.has(id));
  const effective =
    personIds.length > 0 ? personIds : selected.length > 0 ? nameChips.map((p) => p.id) : null;
  return {
    familyChips: families.length < 2 ? [] : [...families],
    nameChips,
    selection: { familyIds: selected.map((f) => f.id), personIds },
    effective,
  };
}

// On adds the family; off removes it and drops the selected names that are in
// no other selected family. Adding past MAX_FAMILY_FILTER is a no-op.
export function toggleFamily(
  selection: FilterSelection,
  familyId: string,
  families: readonly FilterFamily[],
): FilterSelection {
  const key = familyId.toLowerCase();
  if (!selection.familyIds.includes(key)) {
    if (selection.familyIds.length >= MAX_FAMILY_FILTER) return selection;
    return { familyIds: [...selection.familyIds, key], personIds: selection.personIds };
  }
  const familyIds = selection.familyIds.filter((x) => x !== key);
  const kept = new Set(
    families.filter((f) => familyIds.includes(f.id)).flatMap((f) => f.memberIds),
  );
  return { familyIds, personIds: selection.personIds.filter((id) => kept.has(id)) };
}

export function togglePersonIn(selection: FilterSelection, personId: string): FilterSelection {
  return { familyIds: selection.familyIds, personIds: togglePerson(selection.personIds, personId) };
}

export type FilterParams = { family?: PersonParam; person?: PersonParam; pick?: string | string[] };

export function parseFilterParams(p: FilterParams): {
  selection: FilterSelection;
  nothingPicked: boolean;
  bare: boolean;
} {
  const picks = p.pick === undefined ? [] : Array.isArray(p.pick) ? p.pick : [p.pick];
  return {
    selection: { familyIds: parseFamilyParam(p.family), personIds: parsePersonParam(p.person) },
    nothingPicked: picks.includes("none"),
    bare: p.family === undefined && p.person === undefined && p.pick === undefined,
  };
}

export function filterQuery(
  selection: FilterSelection,
  opts?: { emptyAs?: "bare" | "none" },
): { family?: string[]; person?: string[]; pick?: "none" } {
  const empty = selection.familyIds.length === 0 && selection.personIds.length === 0;
  if (empty) return opts?.emptyAs === "none" ? { pick: "none" } : {};
  return {
    ...(selection.familyIds.length > 0 ? { family: [...selection.familyIds] } : {}),
    ...(selection.personIds.length > 0 ? { person: [...selection.personIds] } : {}),
  };
}
