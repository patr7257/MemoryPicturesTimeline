"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { session, user } from "@/db/auth-schema";
import {
  families,
  familyPeople,
  members,
  people,
  photos,
  pushSubscriptions,
  tripPeople,
  trips,
} from "@/db/schema";
import { getAdminOrNull } from "@/lib/access";
import { fail, type ActionResult } from "@/lib/action-result";
import { sendInviteEmail } from "@/lib/email";
import { cleanFamilyName, cleanIds, isUuid } from "@/lib/family-admin";
import {
  buildLoginUrl,
  isSelfLockout,
  isValidEmail,
  normalizeEmail,
  parseRole,
} from "@/lib/members";
import { colorsForMissing, firstFreeColorKey, isPaletteKey } from "@/lib/person-colors";
import { deleteObjects, r2Configured } from "@/lib/r2";
import { tagsByTrip, tripsOnlyTagging } from "@/lib/share-rules";

// deleteObjects takes at most 1000 keys per call.
const R2_DELETE_BATCH = 1000;

// Every action here is super admin only and answers a non admin with a refusal
// value: production hides thrown messages, so nothing throws one.
const NOT_ADMIN = "Only a super admin can do this";
const GENERIC = "Something went wrong. Try again.";
const HAS_LOGIN = "Remove their login on the People tab first";

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

const refresh = () => revalidatePath("/", "layout");

async function personExists(personId: string): Promise<boolean> {
  if (!isUuid(personId)) return false;
  try {
    const row = await getDb().query.people.findFirst({ where: eq(people.id, personId) });
    return !!row;
  } catch {
    return false;
  }
}

// ---------- families ----------

export async function createFamily(name: string): Promise<ActionResult<{ id: string }>> {
  if (!(await getAdminOrNull())) return fail(NOT_ADMIN);
  const clean = cleanFamilyName(name);
  if (!clean.ok) return fail(clean.error);
  try {
    const [row] = await getDb()
      .insert(families)
      .values({ name: clean.name })
      .returning({ id: families.id });
    refresh();
    return { ok: true, id: row.id };
  } catch (err) {
    if (pgCode(err) === "23505") return fail("A family with that name already exists");
    return fail(GENERIC);
  }
}

export async function renameFamily(id: string, name: string): Promise<ActionResult> {
  if (!(await getAdminOrNull())) return fail(NOT_ADMIN);
  if (!isUuid(id)) return fail("That family no longer exists");
  const clean = cleanFamilyName(name);
  if (!clean.ok) return fail(clean.error);
  try {
    const rows = await getDb()
      .update(families)
      .set({ name: clean.name })
      .where(eq(families.id, id))
      .returning({ id: families.id });
    if (rows.length === 0) return fail("That family no longer exists");
    refresh();
    return { ok: true };
  } catch (err) {
    if (pgCode(err) === "23505") return fail("A family with that name already exists");
    return fail(GENERIC);
  }
}

// The people stay; only the grouping goes (family_people cascades).
export async function deleteFamily(id: string): Promise<ActionResult> {
  if (!(await getAdminOrNull())) return fail(NOT_ADMIN);
  if (!isUuid(id)) return { ok: true };
  try {
    await getDb().delete(families).where(eq(families.id, id));
    refresh();
    return { ok: true };
  } catch {
    return fail(GENERIC);
  }
}

// Replaces the member list of one family with exactly personIds.
export async function setFamilyPeople(
  familyId: string,
  personIds: string[],
): Promise<ActionResult> {
  if (!(await getAdminOrNull())) return fail(NOT_ADMIN);
  const ids = cleanIds(personIds);
  if (!isUuid(familyId) || !ids) return fail("That family or person no longer exists");
  try {
    const ok = await getDb().transaction(async (tx) => {
      const fam = await tx.query.families.findFirst({ where: eq(families.id, familyId) });
      if (!fam) return false;
      if (ids.length > 0) {
        const found = await tx.select({ id: people.id }).from(people).where(inArray(people.id, ids));
        if (found.length !== ids.length) return false;
        await tx
          .insert(familyPeople)
          .values(ids.map((personId) => ({ familyId, personId })))
          .onConflictDoNothing();
        await tx
          .delete(familyPeople)
          .where(and(eq(familyPeople.familyId, familyId), notInArray(familyPeople.personId, ids)));
      } else {
        await tx.delete(familyPeople).where(eq(familyPeople.familyId, familyId));
      }
      return true;
    });
    if (!ok) return fail("That family or person no longer exists");
    refresh();
    return { ok: true };
  } catch {
    return fail(GENERIC);
  }
}

// ---------- people ----------

export async function addPerson(input: {
  name: string;
  familyIds: string[];
}): Promise<ActionResult<{ id: string }>> {
  if (!(await getAdminOrNull())) return fail(NOT_ADMIN);
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name) return fail("Name is required");
  const familyIds = cleanIds(input?.familyIds ?? []);
  if (!familyIds) return fail("That family no longer exists");
  try {
    const db = getDb();
    const taken = await db.select({ color: people.color }).from(people);
    const color = firstFreeColorKey(taken.map((r) => r.color));
    const id = await db.transaction(async (tx) => {
      const [row] = await tx.insert(people).values({ name, color }).returning({ id: people.id });
      if (familyIds.length > 0) {
        await tx
          .insert(familyPeople)
          .values(familyIds.map((familyId) => ({ familyId, personId: row.id })));
      }
      return row.id;
    });
    refresh();
    return { ok: true, id };
  } catch (err) {
    if (pgCode(err) === "23503") return fail("That family no longer exists");
    return fail(GENERIC);
  }
}

export async function renamePerson(id: string, name: string): Promise<ActionResult> {
  if (!(await getAdminOrNull())) return fail(NOT_ADMIN);
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return fail("Name is required");
  if (!isUuid(id)) return fail("That person no longer exists");
  try {
    await getDb().update(people).set({ name: trimmed }).where(eq(people.id, id));
    refresh();
    return { ok: true };
  } catch {
    return fail(GENERIC);
  }
}

// A person who still has a login cannot be deleted (members.person_id is
// ON DELETE RESTRICT): say so instead of surfacing a database error.
// A vacation always keeps at least one person, so the vacations only this
// person was on go with them, photos included (rows cascade in the same
// transaction; storage objects are removed after the commit, best effort).
export async function deletePerson(id: string): Promise<ActionResult> {
  if (!(await getAdminOrNull())) return fail(NOT_ADMIN);
  if (!isUuid(id)) return { ok: true };
  const db = getDb();
  let keys: string[];
  try {
    const login = await db.query.members.findFirst({ where: eq(members.personId, id) });
    if (login) return fail(HAS_LOGIN);
    keys = await db.transaction(async (tx) => {
      const own = await tx
        .select({ tripId: tripPeople.tripId })
        .from(tripPeople)
        .where(eq(tripPeople.personId, id));
      const tagged = Array.from(new Set(own.map((r) => r.tripId)));
      const rows =
        tagged.length > 0
          ? await tx
              .select({ tripId: tripPeople.tripId, personId: tripPeople.personId })
              .from(tripPeople)
              .where(inArray(tripPeople.tripId, tagged))
          : [];
      const doomed = tripsOnlyTagging(id, tagsByTrip(rows));
      let objectKeys: string[] = [];
      if (doomed.length > 0) {
        const shots = await tx
          .select({ o: photos.r2KeyOriginal, s: photos.r2Key400, l: photos.r2Key1200 })
          .from(photos)
          .where(inArray(photos.tripId, doomed));
        objectKeys = shots.flatMap((p) => [p.o, p.s, p.l]);
        // Photo rows, comments, tags and shares cascade.
        await tx.delete(trips).where(inArray(trips.id, doomed));
      }
      await tx.delete(people).where(eq(people.id, id));
      return objectKeys;
    });
  } catch (err) {
    if (pgCode(err) === "23503") return fail(HAS_LOGIN);
    return fail(GENERIC);
  }
  await deleteStoredObjects(keys);
  refresh();
  return { ok: true };
}

// Best effort: an orphaned object is cheap, failing an action whose rows are
// already gone is not. Logs the error name only.
async function deleteStoredObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  if (!r2Configured()) {
    console.error("[family] storage not configured, objects left:", keys.length);
    return;
  }
  for (let i = 0; i < keys.length; i += R2_DELETE_BATCH) {
    try {
      await deleteObjects(keys.slice(i, i + R2_DELETE_BATCH));
    } catch (err) {
      console.error("[family] storage delete failed", err instanceof Error ? err.name : "error");
    }
  }
}

export async function setPersonColor(
  personId: string,
  colorKey: string | null,
): Promise<ActionResult> {
  if (!(await getAdminOrNull())) return fail(NOT_ADMIN);
  if (!isUuid(personId)) return fail("That person no longer exists");
  if (colorKey !== null && !isPaletteKey(colorKey)) return fail("Unknown colour");
  try {
    const db = getDb();
    if (colorKey !== null) {
      const owner = await db.query.people.findFirst({ where: eq(people.color, colorKey) });
      if (owner && owner.id !== personId) return fail("Another person has that colour");
    }
    const rows = await db
      .update(people)
      .set({ color: colorKey })
      .where(eq(people.id, personId))
      .returning({ id: people.id });
    if (rows.length === 0) return fail("That person no longer exists");
    refresh();
    return { ok: true };
  } catch (err) {
    if (pgCode(err) === "23505") return fail("Another person has that colour");
    return fail(GENERIC);
  }
}

// Gives every person without a valid colour the next free palette colour.
export async function assignMissingColors(): Promise<ActionResult<{ assigned: number }>> {
  if (!(await getAdminOrNull())) return fail(NOT_ADMIN);
  try {
    const db = getDb();
    const rows = await db.select({ id: people.id, color: people.color }).from(people);
    const plan = colorsForMissing(rows);
    for (const p of plan) {
      await db.update(people).set({ color: p.color }).where(eq(people.id, p.personId));
    }
    refresh();
    return { ok: true, assigned: plan.length };
  } catch (err) {
    if (pgCode(err) === "23505") return fail("A colour was taken meanwhile. Try again.");
    return fail(GENERIC);
  }
}

// Replaces the families of one person with exactly familyIds.
export async function setPersonFamilies(
  personId: string,
  familyIds: string[],
): Promise<ActionResult> {
  if (!(await getAdminOrNull())) return fail(NOT_ADMIN);
  const ids = cleanIds(familyIds);
  if (!isUuid(personId) || !ids) return fail("That family or person no longer exists");
  try {
    const ok = await getDb().transaction(async (tx) => {
      const person = await tx.query.people.findFirst({ where: eq(people.id, personId) });
      if (!person) return false;
      if (ids.length > 0) {
        const found = await tx
          .select({ id: families.id })
          .from(families)
          .where(inArray(families.id, ids));
        if (found.length !== ids.length) return false;
        await tx
          .insert(familyPeople)
          .values(ids.map((familyId) => ({ familyId, personId })))
          .onConflictDoNothing();
        await tx
          .delete(familyPeople)
          .where(and(eq(familyPeople.personId, personId), notInArray(familyPeople.familyId, ids)));
      } else {
        await tx.delete(familyPeople).where(eq(familyPeople.personId, personId));
      }
      return true;
    });
    if (!ok) return fail("That family or person no longer exists");
    refresh();
    return { ok: true };
  } catch {
    return fail(GENERIC);
  }
}

// ---------- logins (moved from members.ts, logic unchanged) ----------

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
  const viewer = await getAdminOrNull();
  if (!viewer) return fail(NOT_ADMIN);
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

  refresh();
  const mailSent = input.sendEmail ? await deliverInvite(email, viewer.name) : null;
  return { ok: true, mailSent };
}

export async function resendInvite(memberId: string): Promise<ActionResult> {
  const viewer = await getAdminOrNull();
  if (!viewer) return fail(NOT_ADMIN);
  const member = isUuid(memberId)
    ? await getDb().query.members.findFirst({ where: eq(members.id, memberId) })
    : undefined;
  if (!member) return fail("That member no longer exists");
  const sent = await deliverInvite(member.email, viewer.name);
  return sent ? { ok: true } : fail("The mail could not be sent");
}

export async function updateMember(input: {
  id: string;
  role: string;
  personId: string;
}): Promise<ActionResult> {
  const viewer = await getAdminOrNull();
  if (!viewer) return fail(NOT_ADMIN);
  const role = parseRole(input?.role);
  if (!role) return fail("Choose a role");
  const db = getDb();
  const member = isUuid(input.id)
    ? await db.query.members.findFirst({ where: eq(members.id, input.id) })
    : undefined;
  if (!member) return fail("That member no longer exists");
  if (isSelfLockout(viewer.email, member.email, { type: "role", role })) {
    return fail("You cannot demote your own login");
  }
  if (!(await personExists(input.personId))) return fail("That person no longer exists");
  await db.update(members).set({ role, personId: input.personId }).where(eq(members.id, member.id));
  refresh();
  return { ok: true };
}

// Deletes the member row, every session and every push subscription of that
// login so access ends now.
// The user row, photos and comments stay.
export async function removeMember(memberId: string): Promise<ActionResult> {
  const viewer = await getAdminOrNull();
  if (!viewer) return fail(NOT_ADMIN);
  const db = getDb();
  const member = isUuid(memberId)
    ? await db.query.members.findFirst({ where: eq(members.id, memberId) })
    : undefined;
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
  for (const u of users) {
    await db.delete(session).where(eq(session.userId, u.id));
    // No more pushes about vacations this login could see.
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, u.id));
  }
  refresh();
  return { ok: true };
}
