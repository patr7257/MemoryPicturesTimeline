"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { people } from "@/db/schema";
import { requireSession } from "@/lib/session";

export async function createPerson(name: string): Promise<{ id: string }> {
  await requireSession();
  const trimmed = name?.trim();
  if (!trimmed) throw new Error("Name is required");
  const [row] = await getDb()
    .insert(people)
    .values({ name: trimmed })
    .returning({ id: people.id });
  revalidatePath("/people");
  revalidatePath("/");
  return { id: row.id };
}

export async function renamePerson(id: string, name: string): Promise<void> {
  await requireSession();
  const trimmed = name?.trim();
  if (!trimmed) throw new Error("Name is required");
  await getDb().update(people).set({ name: trimmed }).where(eq(people.id, id));
  revalidatePath("/people");
  revalidatePath("/");
}

export async function deletePerson(id: string): Promise<void> {
  await requireSession();
  await getDb().delete(people).where(eq(people.id, id));
  revalidatePath("/people");
  revalidatePath("/");
}
