// Lookups for families and the people a viewer may see. The rules are pure
// functions in access-policy.ts; this file only loads facts and filters in SQL.
import "server-only";

import { asc, eq, inArray, or } from "drizzle-orm";

import { getDb } from "@/db";
import { families, familyPeople, people } from "@/db/schema";
import { isSuperAdmin, peopleScope, type PersonFacts, type Viewer } from "@/lib/access-policy";

// Ids reach these functions from URLs and forms; a malformed one would make
// Postgres reject the whole uuid comparison, so it is dropped as unknown.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FamilyWithMembers = { id: string; name: string; memberIds: string[] };

// Super admin: every family. Otherwise the viewer's own families. Ordered by
// name; memberIds ordered by person name.
export async function getViewerFamilies(viewer: Viewer): Promise<FamilyWithMembers[]> {
  const all = isSuperAdmin(viewer);
  if (!all && viewer.familyIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({ id: families.id, name: families.name })
    .from(families)
    .where(all ? undefined : inArray(families.id, viewer.familyIds))
    .orderBy(asc(families.name));
  if (rows.length === 0) return [];
  const links = await db
    .select({ familyId: familyPeople.familyId, personId: familyPeople.personId })
    .from(familyPeople)
    .innerJoin(people, eq(people.id, familyPeople.personId))
    .where(
      inArray(
        familyPeople.familyId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(people.name));
  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    memberIds: links.filter((l) => l.familyId === f.id).map((l) => l.personId),
  }));
}

export type PersonChoice = { id: string; name: string; color: string | null };

// The people the viewer may see, in one read built from peopleScope.
export async function getVisiblePeople(viewer: Viewer): Promise<PersonChoice[]> {
  const scope = peopleScope(viewer);
  if (scope.kind === "none") return [];
  const db = getDb();
  const where =
    scope.kind === "all"
      ? undefined
      : scope.familyIds.length === 0
        ? eq(people.id, scope.selfId)
        : or(
            eq(people.id, scope.selfId),
            inArray(
              people.id,
              db
                .select({ id: familyPeople.personId })
                .from(familyPeople)
                .where(inArray(familyPeople.familyId, [...scope.familyIds])),
            ),
          );
  return db
    .select({ id: people.id, name: people.name, color: people.color })
    .from(people)
    .where(where)
    .orderBy(asc(people.name));
}

// Family facts per person for the pure rules. Unknown ids are absent.
export async function getPersonFacts(personIds: readonly string[]): Promise<Map<string, PersonFacts>> {
  const ids = Array.from(new Set(personIds.filter((id) => UUID.test(id))));
  const out = new Map<string, PersonFacts>();
  if (ids.length === 0) return out;
  const rows = await getDb()
    .select({ id: people.id, familyId: familyPeople.familyId })
    .from(people)
    .leftJoin(familyPeople, eq(familyPeople.personId, people.id))
    .where(inArray(people.id, ids));
  const familyIds = new Map<string, string[]>();
  for (const r of rows) {
    const list = familyIds.get(r.id) ?? [];
    if (r.familyId !== null) list.push(r.familyId);
    familyIds.set(r.id, list);
  }
  for (const [id, fams] of familyIds) out.set(id, { id, familyIds: fams });
  return out;
}
