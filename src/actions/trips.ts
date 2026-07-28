"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { tripPeople, trips } from "@/db/schema";
import { requireSession } from "@/lib/session";

export type CreateTripInput = {
  title: string;
  startDate: string; // yyyy-mm-dd
  endDate?: string | null;
  locationName?: string | null;
  description?: string | null;
};

export async function createTrip(input: CreateTripInput): Promise<{ id: string }> {
  await requireSession();
  const title = input.title?.trim();
  if (!title) throw new Error("Title is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate ?? "")) {
    throw new Error("Start date is required");
  }

  const db = getDb();
  const [row] = await db
    .insert(trips)
    .values({
      title,
      startDate: input.startDate,
      endDate: input.endDate || null,
      locationName: input.locationName?.trim() || null,
      description: input.description?.trim() || null,
    })
    .returning({ id: trips.id });

  revalidatePath("/");
  return { id: row.id };
}

export type UpdateTripInput = {
  id: string;
  title?: string;
  startDate?: string;
  endDate?: string | null;
  locationName?: string | null;
  description?: string | null;
  lat?: number | null;
  lng?: number | null;
  coverPhotoId?: string | null;
};

export async function updateTrip(input: UpdateTripInput): Promise<void> {
  await requireSession();
  const db = getDb();
  const patch: Partial<typeof trips.$inferInsert> = {};
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new Error("Title cannot be empty");
    patch.title = t;
  }
  if (input.startDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw new Error("Bad start date");
    patch.startDate = input.startDate;
  }
  if (input.endDate !== undefined) patch.endDate = input.endDate || null;
  if (input.locationName !== undefined) patch.locationName = input.locationName?.trim() || null;
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.lat !== undefined) patch.lat = input.lat;
  if (input.lng !== undefined) patch.lng = input.lng;
  if (input.coverPhotoId !== undefined) patch.coverPhotoId = input.coverPhotoId;
  if (Object.keys(patch).length === 0) return;

  await db.update(trips).set(patch).where(eq(trips.id, input.id));
  revalidatePath("/");
  revalidatePath(`/trips/${input.id}`);
}

export async function setTripPeople(tripId: string, personIds: string[]): Promise<void> {
  await requireSession();
  const db = getDb();
  await db.delete(tripPeople).where(eq(tripPeople.tripId, tripId));
  if (personIds.length > 0) {
    await db
      .insert(tripPeople)
      .values(personIds.map((personId) => ({ tripId, personId })))
      .onConflictDoNothing();
  }
  revalidatePath("/");
  revalidatePath(`/trips/${tripId}`);
}

export async function deleteTrip(tripId: string): Promise<void> {
  await requireSession();
  // Photo rows cascade; R2 objects become orphans (cheap, swept later).
  await getDb().delete(trips).where(eq(trips.id, tripId));
  revalidatePath("/");
}
