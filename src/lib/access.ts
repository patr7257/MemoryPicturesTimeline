// Server side of the access rules: resolves the signed-in viewer and answers
// "which trips can they see". The rules themselves are pure functions in
// access-policy.ts; this file only does the lookups.
import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { user as userTable } from "@/db/auth-schema";
import { familyPeople, members, photos, tripPeople, trips, tripShares } from "@/db/schema";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import {
  audienceEmails,
  canSeeTrip,
  isSuperAdmin,
  loginAllowed,
  resolveRole,
  visibleTripIdsFrom,
  type Viewer,
} from "@/lib/access-policy";

type SessionUser = { id: string; email: string; name: string };

// Null when the login is no longer allowed (member removed after sign-in): a
// live session or passkey alone never grants access.
async function toViewer(u: SessionUser): Promise<Viewer | null> {
  const email = u.email.toLowerCase();
  const member = await getDb().query.members.findFirst({ where: eq(members.email, email) });
  if (!loginAllowed(email, member ? [member.email] : [], process.env)) return null;
  const personId = member?.personId ?? null;
  const familyRows = personId
    ? await getDb()
        .select({ id: familyPeople.familyId })
        .from(familyPeople)
        .where(eq(familyPeople.personId, personId))
    : [];
  return {
    userId: u.id,
    email,
    name: u.name,
    role: resolveRole(email, member?.role, process.env),
    personId,
    familyIds: familyRows.map((r) => r.id),
  };
}

// Pages and server actions: redirects to /login without a session or when
// the login is no longer allowed. Memoized per request, so the layout and the
// page share one lookup.
export const getViewer = cache(async (): Promise<Viewer> => {
  const session = await getSession();
  const viewer = session ? await toViewer(session.user) : null;
  if (!viewer) redirect("/login");
  return viewer;
});

// API routes: null instead of a redirect, so the route can answer 401.
export async function getViewerOrNull(): Promise<Viewer | null> {
  const session = await getSession();
  return session ? toViewer(session.user) : null;
}

// Server actions that must not throw: the viewer when super admin, else null.
export async function getAdminOrNull(): Promise<Viewer | null> {
  const viewer = await getViewerOrNull();
  return viewer && isSuperAdmin(viewer) ? viewer : null;
}

export type TripRow = typeof trips.$inferSelect;

// "all" for super admins, otherwise the ids the viewer may see.
export async function visibleTripIds(viewer: Viewer): Promise<"all" | Set<string>> {
  if (isSuperAdmin(viewer)) return "all";
  const db = getDb();
  const none = Promise.resolve([] as { id: string }[]);
  const [created, tagged, shared] = await Promise.all([
    db.select({ id: trips.id }).from(trips).where(eq(trips.createdBy, viewer.userId)),
    viewer.personId
      ? db
          .select({ id: tripPeople.tripId })
          .from(tripPeople)
          .where(eq(tripPeople.personId, viewer.personId))
      : none,
    viewer.personId
      ? db
          .select({ id: tripShares.tripId })
          .from(tripShares)
          .where(eq(tripShares.personId, viewer.personId))
      : none,
  ]);
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
  return visibleTripIdsFrom(viewer, { created: ids(created), tagged: ids(tagged), shared: ids(shared) });
}

// Tagged and shared person ids of one trip: the facts canSeeTrip needs.
async function tripPersonFacts(tripId: string): Promise<{ personIds: string[]; sharedPersonIds: string[] }> {
  const db = getDb();
  const [links, shares] = await Promise.all([
    db.select({ personId: tripPeople.personId }).from(tripPeople).where(eq(tripPeople.tripId, tripId)),
    db.select({ personId: tripShares.personId }).from(tripShares).where(eq(tripShares.tripId, tripId)),
  ]);
  return { personIds: links.map((l) => l.personId), sharedPersonIds: shares.map((s) => s.personId) };
}

// The trip when the viewer may see it, otherwise null. Callers treat null as
// "not found" so an invisible trip is indistinguishable from a missing one.
export async function findVisibleTrip(viewer: Viewer, tripId: string): Promise<TripRow | null> {
  const db = getDb();
  const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
  if (!trip) return null;
  if (isSuperAdmin(viewer)) return trip;
  const facts = await tripPersonFacts(tripId);
  return canSeeTrip(viewer, { createdBy: trip.createdBy, ...facts }) ? trip : null;
}

export type PhotoRow = typeof photos.$inferSelect;

// The photo (with its trip) when the viewer may see the trip it belongs to.
export async function findVisiblePhoto(
  viewer: Viewer,
  photoId: string,
): Promise<{ photo: PhotoRow; trip: TripRow } | null> {
  const photo = await getDb().query.photos.findFirst({ where: eq(photos.id, photoId) });
  if (!photo) return null;
  const trip = await findVisibleTrip(viewer, photo.tripId);
  return trip ? { photo, trip } : null;
}

// User ids that may see a trip: the audience for its push notifications.
export async function tripAudienceUserIds(tripId: string): Promise<string[]> {
  const db = getDb();
  const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
  if (!trip) return [];
  const [facts, memberRows] = await Promise.all([tripPersonFacts(tripId), db.select().from(members)]);
  const emails = audienceEmails({ trip: facts, members: memberRows, env: process.env });

  const ids = new Set<string>();
  if (trip.createdBy) ids.add(trip.createdBy);
  if (emails.size > 0) {
    // user.email is stored as typed at sign-up; members emails are lowercase.
    const users = await db.select({ id: userTable.id, email: userTable.email }).from(userTable);
    for (const u of users) if (emails.has(u.email.toLowerCase())) ids.add(u.id);
  }
  return Array.from(ids);
}
