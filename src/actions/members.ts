"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { session, user } from "@/db/auth-schema";
import { members, people } from "@/db/schema";
import { getViewer } from "@/lib/access";
import { AccessError, canAdminister } from "@/lib/access-policy";
import { sendInviteEmail } from "@/lib/email";
import {
  buildLoginUrl,
  isSelfLockout,
  isValidEmail,
  normalizeEmail,
  parseRole,
} from "@/lib/members";

async function requireAdmin() {
  const viewer = await getViewer();
  if (!canAdminister(viewer)) throw new AccessError("Only a super admin can do this");
  return viewer;
}

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

async function personExists(personId: string): Promise<boolean> {
  if (typeof personId !== "string" || !personId) return false;
  try {
    const row = await getDb().query.people.findFirst({ where: eq(people.id, personId) });
    return !!row;
  } catch {
    // Not a valid uuid.
    return false;
  }
}

// mailSent is null when no mail was asked for.
async function deliverInvite(email: string, inviterName: string): Promise<boolean> {
  const loginUrl = buildLoginUrl(process.env.BETTER_AUTH_URL);
  if (!loginUrl) {
    console.warn("members: BETTER_AUTH_URL not set, invite mail not sent");
    return false;
  }
  return sendInviteEmail(email, inviterName, loginUrl);
}

export async function inviteMember(input: {
  personId: string;
  email: string;
  role: string;
  sendEmail: boolean;
}): Promise<ActionResult<{ mailSent: boolean | null }>> {
  const viewer = await requireAdmin();
  if (!input?.personId) return fail("Choose a person first");
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) return fail("Enter a valid email address");
  const role = parseRole(input.role);
  if (!role) return fail("Choose a role");
  if (!(await personExists(input.personId))) return fail("That person no longer exists");

  const inserted = await getDb()
    .insert(members)
    .values({ email, personId: input.personId, role, invitedBy: viewer.userId })
    .onConflictDoNothing({ target: members.email })
    .returning({ id: members.id });
  if (inserted.length === 0) return fail("That email already has a login");

  revalidatePath("/members");
  revalidatePath("/people");
  const mailSent = input.sendEmail ? await deliverInvite(email, viewer.name) : null;
  return { ok: true, mailSent };
}

export async function resendInvite(memberId: string): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const member = await getDb().query.members.findFirst({ where: eq(members.id, memberId) });
  if (!member) return fail("That member no longer exists");
  const sent = await deliverInvite(member.email, viewer.name);
  return sent ? { ok: true } : fail("The mail could not be sent");
}

export async function updateMember(input: {
  id: string;
  role: string;
  personId: string;
}): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const role = parseRole(input?.role);
  if (!role) return fail("Choose a role");
  const db = getDb();
  const member = await db.query.members.findFirst({ where: eq(members.id, input.id) });
  if (!member) return fail("That member no longer exists");
  if (isSelfLockout(viewer.email, member.email, { type: "role", role })) {
    return fail("You cannot demote your own login");
  }
  if (!(await personExists(input.personId))) return fail("That person no longer exists");
  await db.update(members).set({ role, personId: input.personId }).where(eq(members.id, member.id));
  revalidatePath("/", "layout");
  return { ok: true };
}

// Deletes the member row and every session of that login so access ends now.
// The user row, photos and comments stay.
export async function removeMember(memberId: string): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const db = getDb();
  const member = await db.query.members.findFirst({ where: eq(members.id, memberId) });
  if (!member) return { ok: true };
  if (isSelfLockout(viewer.email, member.email, { type: "remove" })) {
    return fail("You cannot remove your own login");
  }
  const email = normalizeEmail(member.email);
  await db.delete(members).where(eq(members.id, member.id));
  const users = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`);
  for (const u of users) await db.delete(session).where(eq(session.userId, u.id));
  revalidatePath("/", "layout");
  return { ok: true };
}
