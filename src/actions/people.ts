"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { members, people } from "@/db/schema";
import { getViewer } from "@/lib/access";
import { AccessError, canAdminister } from "@/lib/access-policy";

async function requireAdmin() {
  const viewer = await getViewer();
  if (!canAdminister(viewer)) throw new AccessError("Only a super admin can do this");
  return viewer;
}

// Any member may add a person (needed when tagging a new trip).
export async function createPerson(name: string): Promise<{ id: string }> {
  await getViewer();
  const trimmed = name?.trim();
  if (!trimmed) throw new Error("Name is required");
  const [row] = await getDb()
    .insert(people)
    .values({ name: trimmed })
    .returning({ id: people.id });
  revalidatePath("/", "layout");
  return { id: row.id };
}

export async function renamePerson(id: string, name: string): Promise<void> {
  await requireAdmin();
  const trimmed = name?.trim();
  if (!trimmed) throw new Error("Name is required");
  await getDb().update(people).set({ name: trimmed }).where(eq(people.id, id));
  revalidatePath("/", "layout");
}

// A person who still has a login cannot be deleted (members.person_id is
// ON DELETE RESTRICT): say so instead of surfacing a database error.
const HAS_LOGIN = "Remove their login on the Members page first";

export async function deletePerson(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const db = getDb();
  const login = await db.query.members.findFirst({ where: eq(members.personId, id) });
  if (login) return { ok: false, error: HAS_LOGIN };
  try {
    await db.delete(people).where(eq(people.id, id));
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    if ((e.cause?.code ?? e.code) === "23503") return { ok: false, error: HAS_LOGIN };
    throw err;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
