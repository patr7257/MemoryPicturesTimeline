"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { people } from "@/db/schema";
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

export async function deletePerson(id: string): Promise<void> {
  await requireAdmin();
  await getDb().delete(people).where(eq(people.id, id));
  revalidatePath("/", "layout");
}
