"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { people } from "@/db/schema";
import { getViewer } from "@/lib/access";
import { AccessError, canAdminister } from "@/lib/access-policy";

// Temporary: src/components/vacations/PeoplePicker.tsx still imports this and
// the wave 2 stream that owns it deletes this file. A person created here
// belongs to no family. Super admins only.
export async function createPerson(name: string): Promise<{ id: string }> {
  const viewer = await getViewer();
  if (!canAdminister(viewer)) throw new AccessError("Only a super admin can do this");
  const trimmed = name?.trim();
  if (!trimmed) throw new Error("Name is required");
  const [row] = await getDb()
    .insert(people)
    .values({ name: trimmed })
    .returning({ id: people.id });
  revalidatePath("/", "layout");
  return { id: row.id };
}
