// Server-only reads for the /family admin page.
import "server-only";

import { asc, count, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { passkey, user } from "@/db/auth-schema";
import { families, familyPeople, members, people } from "@/db/schema";
import type { FamilyWithMembers } from "@/lib/family-queries";
import { mergeLogins, normalizeEmail, type LoginEntry, type MemberStatus } from "@/lib/members";

async function loginFacts() {
  const db = getDb();
  const [users, keys] = await Promise.all([
    db.select({ id: user.id, email: user.email }).from(user),
    db
      .select({ userId: passkey.userId, n: count() })
      .from(passkey)
      .groupBy(passkey.userId),
  ]);
  const emailByUserId = new Map(users.map((u) => [u.id, normalizeEmail(u.email)]));
  const userEmails = new Set(emailByUserId.values());
  const passkeyCounts = new Map<string, number>();
  for (const k of keys) {
    const email = emailByUserId.get(k.userId);
    if (email) passkeyCounts.set(email, (passkeyCounts.get(email) ?? 0) + Number(k.n));
  }
  return { userEmails, passkeyCounts };
}

export type AdminPerson = {
  id: string;
  name: string;
  color: string | null;
  familyIds: string[];
  logins: { email: string; status: MemberStatus }[];
};

// Everything the super admin /family page needs, in one go: all families with
// their members, every person with families and logins, and the merged logins.
export async function getFamilyAdminData(): Promise<{
  families: FamilyWithMembers[];
  people: AdminPerson[];
  logins: LoginEntry[];
}> {
  const db = getDb();
  const [familyRows, peopleRows, links, memberRows, facts] = await Promise.all([
    db.select({ id: families.id, name: families.name }).from(families).orderBy(asc(families.name)),
    db
      .select({ id: people.id, name: people.name, color: people.color })
      .from(people)
      .orderBy(asc(people.name)),
    db
      .select({ familyId: familyPeople.familyId, personId: familyPeople.personId })
      .from(familyPeople)
      .orderBy(asc(familyPeople.familyId), asc(familyPeople.personId)),
    db
      .select({
        id: members.id,
        email: members.email,
        role: members.role,
        personId: members.personId,
        personName: people.name,
      })
      .from(members)
      .innerJoin(people, eq(members.personId, people.id))
      .orderBy(asc(people.name), asc(members.email)),
    loginFacts(),
  ]);
  const logins = mergeLogins(memberRows, facts.userEmails, facts.passkeyCounts, process.env);
  // peopleRows is ordered by name, so member lists come out in name order.
  return {
    families: familyRows.map((f) => ({
      id: f.id,
      name: f.name,
      memberIds: peopleRows
        .filter((p) => links.some((l) => l.familyId === f.id && l.personId === p.id))
        .map((p) => p.id),
    })),
    people: peopleRows.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      familyIds: links.filter((l) => l.personId === p.id).map((l) => l.familyId),
      logins: logins
        .filter((l): l is Extract<LoginEntry, { kind: "member" }> => l.kind === "member")
        .filter((l) => l.personId === p.id)
        .map((l) => ({ email: l.email, status: l.status })),
    })),
    logins,
  };
}
