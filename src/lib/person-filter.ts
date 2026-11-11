// The multi-person filter lives in the URL as repeated `person` params:
// ?person=<id>&person=<id>. A vacation matches when ANY selected person is
// tagged on it; no param means everyone. One param keeps working (old links).

export const MAX_PEOPLE_FILTER = 12;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PersonParam = string | string[] | undefined;

// Next searchParams give string | string[] | undefined for a repeated param.
// Keeps only uuid-shaped values, lower-cased, deduped in first-seen order,
// capped at MAX_PEOPLE_FILTER.
export function parsePersonParam(raw: PersonParam): string[] {
  const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const value of list) {
    if (typeof value !== "string") continue;
    const id = value.trim().toLowerCase();
    if (!UUID.test(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_PEOPLE_FILTER) break;
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
