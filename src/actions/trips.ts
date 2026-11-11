"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { tripPeople, trips } from "@/db/schema";
import { findVisibleTrip, getViewer, tripAudienceUserIds } from "@/lib/access";
import { AccessError, canManageTrip, type Viewer } from "@/lib/access-policy";
import { tripCreatedPayload } from "@/lib/push/copy";
import { broadcastPush } from "@/lib/push/send";

// The trip when the viewer may manage it (creator or super admin). A trip the
// viewer cannot even see reads as missing.
async function requireManagedTrip(viewer: Viewer, tripId: string) {
  const trip = await findVisibleTrip(viewer, tripId);
  if (!trip) throw new AccessError("Trip not found");
  if (!canManageTrip(viewer, trip)) {
    throw new AccessError("Only the creator or a super admin can change this trip");
  }
  return trip;
}

export type CreateTripInput = {
  title: string;
  startDate: string; // yyyy-mm-dd
  endDate?: string | null;
  locationName?: string | null;
  description?: string | null;
  // People tagged at creation: they (and only they, plus the creator and
  // super admins) will see the trip.
  personIds?: string[];
};

export async function createTrip(input: CreateTripInput): Promise<{ id: string }> {
  const viewer = await getViewer();
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
      createdBy: viewer.userId,
    })
    .returning({ id: trips.id });

  const personIds = Array.from(new Set(input.personIds ?? []));
  if (personIds.length > 0) {
    await db
      .insert(tripPeople)
      .values(personIds.map((personId) => ({ tripId: row.id, personId })))
      .onConflictDoNothing();
  }

  // Push after the response; a failing push must never fail the create.
  after(async () => {
    try {
      await broadcastPush(
        "trip_created",
        tripCreatedPayload({ tripId: row.id, tripTitle: title }),
        { excludeUserId: viewer.userId, onlyUserIds: await tripAudienceUserIds(row.id) },
      );
    } catch (err) {
      console.error("[push] trip_created failed", err instanceof Error ? err.message : err);
    }
  });

  revalidatePath("/", "layout");
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
  await requireManagedTrip(await getViewer(), input.id);
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
  revalidatePath("/", "layout");
}

export async function setTripPeople(tripId: string, personIds: string[]): Promise<void> {
  await requireManagedTrip(await getViewer(), tripId);
  const db = getDb();
  await db.delete(tripPeople).where(eq(tripPeople.tripId, tripId));
  if (personIds.length > 0) {
    await db
      .insert(tripPeople)
      .values(personIds.map((personId) => ({ tripId, personId })))
      .onConflictDoNothing();
  }
  revalidatePath("/", "layout");
}

export async function deleteTrip(tripId: string): Promise<void> {
  await requireManagedTrip(await getViewer(), tripId);
  // Photo rows cascade; R2 objects become orphans (cheap, swept later).
  await getDb().delete(trips).where(eq(trips.id, tripId));
  revalidatePath("/", "layout");
}
