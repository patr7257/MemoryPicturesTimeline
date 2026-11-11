// Server-only reads for the Members and People pages.
import "server-only";

import { asc, count, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { passkey, user } from "@/db/auth-schema";
import { members, people } from "@/db/schema";
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

export type PersonOption = { id: string; name: string };

export async function getMembersPageData(): Promise<{
  logins: LoginEntry[];
  people: PersonOption[];
}> {
  const db = getDb();
  const [rows, peopleRows, facts] = await Promise.all([
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
    db.select({ id: people.id, name: people.name }).from(people).orderBy(asc(people.name)),
    loginFacts(),
  ]);
  return {
    logins: mergeLogins(rows, facts.userEmails, facts.passkeyCounts, process.env),
    people: peopleRows,
  };
}

export type PersonView = {
  id: string;
  name: string;
  hasLogin: boolean;
  // Only filled for super admins: other members never see emails here.
  logins: { email: string; status: MemberStatus }[];
};

export async function getPeopleView(includeLogins: boolean): Promise<PersonView[]> {
  const db = getDb();
  const [peopleRows, memberRows, facts] = await Promise.all([
    db.select({ id: people.id, name: people.name }).from(people).orderBy(asc(people.name)),
    db.select({ email: members.email, personId: members.personId }).from(members),
    includeLogins ? loginFacts() : Promise.resolve(null),
  ]);
  return peopleRows.map((p) => {
    const mine = memberRows.filter((m) => m.personId === p.id);
    return {
      id: p.id,
      name: p.name,
      hasLogin: mine.length > 0,
      logins:
        includeLogins && facts
          ? mine.map((m) => ({
              email: m.email,
              status: facts.userEmails.has(normalizeEmail(m.email)) ? ("active" as const) : ("invited" as const),
            }))
          : [],
    };
  });
}
