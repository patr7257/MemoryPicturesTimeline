// Server-only reads for the countries page. Each read returns only what the
// viewer may see: the columns and statuses come from the tier helpers in
// access-policy.ts, never from the tier name.
import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { members, people, personCountries } from "@/db/schema";
import {
  canSeePerson,
  countriesTier,
  tierColumns,
  tierStatuses,
  type CountriesTier,
  type Viewer,
} from "@/lib/access-policy";
import type { CountryMark } from "@/lib/countries";
import { getPersonFacts } from "@/lib/family-queries";

export type PersonTarget = { id: string; name: string; hasLogin: boolean; familyIds: string[] };

export async function getPersonTarget(personId: string): Promise<PersonTarget | null> {
  const db = getDb();
  const [person] = await db
    .select({ id: people.id, name: people.name })
    .from(people)
    .where(eq(people.id, personId));
  if (!person) return null;
  const [[login], facts] = await Promise.all([
    db.select({ id: members.id }).from(members).where(eq(members.personId, personId)).limit(1),
    getPersonFacts([person.id]),
  ]);
  return {
    id: person.id,
    name: person.name,
    hasLogin: login !== undefined,
    familyIds: [...(facts.get(person.id)?.familyIds ?? [])],
  };
}

export async function getPersonCountries(
  viewer: Viewer,
  person: PersonTarget,
): Promise<{ tier: CountriesTier; marks: CountryMark[] }> {
  const tier = countriesTier(viewer, person);
  // note is part of the selected columns only when the tier may read it:
  // tierColumns alone decides which columns go into the select.
  const all = {
    countryKey: personCountries.countryKey,
    status: personCountries.status,
    year: personCountries.year,
    note: personCountries.note,
  };
  const columns = Object.fromEntries(tierColumns(tier).map((c) => [c, all[c]]));
  const rows = await getDb()
    .select(columns)
    .from(personCountries)
    .where(
      and(
        eq(personCountries.personId, person.id),
        inArray(personCountries.status, [...tierStatuses(tier)]),
      ),
    )
    .orderBy(asc(personCountries.countryKey));
  return { tier, marks: rows as CountryMark[] };
}

// The multi-person read: visited rows only (never wishlist or dismissed, also
// for the viewer's own person), no notes. An id the viewer may not see
// (canSeePerson) is dropped before the query, so its rows are never read and
// it is absent from the result.
export async function getVisitedByPerson(
  viewer: Viewer,
  personIds: readonly string[],
): Promise<Record<string, string[]>> {
  if (personIds.length === 0) return {};
  const facts = await getPersonFacts(personIds);
  const visible = Array.from(new Set(personIds)).filter((id) => {
    const person = facts.get(id);
    return person !== undefined && canSeePerson(viewer, person);
  });
  if (visible.length === 0) return {};
  const out: Record<string, string[]> = {};
  for (const id of visible) out[id] = [];
  const rows = await getDb()
    .select({ personId: personCountries.personId, countryKey: personCountries.countryKey })
    .from(personCountries)
    .where(and(inArray(personCountries.personId, visible), eq(personCountries.status, "visited")))
    .orderBy(asc(personCountries.countryKey));
  for (const r of rows) out[r.personId]?.push(r.countryKey);
  return out;
}
