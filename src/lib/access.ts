// Server side of the access rules: resolves the signed-in viewer and answers
// "which trips can they see". The rules themselves are pure functions in
// access-policy.ts; this file only does the lookups.
import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { user as userTable } from "@/db/auth-schema";
import { members, photos, tripPeople, trips } from "@/db/schema";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import {
  canSeeTrip,
  isSuperAdmin,
  loginAllowed,
  resolveRole,
  superAdminEmails,
  type Viewer,
} from "@/lib/access-policy";

type SessionUser = { id: string; email: string; name: string };

// Null when the login is no longer allowed (member removed after sign-in): a
// live session or passkey alone never grants access.
async function toViewer(u: SessionUser): Promise<Viewer | null> {
  const email = u.email.toLowerCase();
  const member = await getDb().query.members.findFirst({ where: eq(members.email, email) });
  if (!loginAllowed(email, member ? [member.email] : [], process.env)) return null;
  return {
    userId: u.id,
    email,
    name: u.name,
    role: resolveRole(email, member?.role, process.env),
    personId: member?.personId ?? null,
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

export type TripRow = typeof trips.$inferSelect;

// "all" for super admins, otherwise the ids the viewer may see.
export async function visibleTripIds(viewer: Viewer): Promise<"all" | Set<string>> {
  if (isSuperAdmin(viewer)) return "all";
  const db = getDb();
  const [created, tagged] = await Promise.all([
    db.select({ id: trips.id }).from(trips).where(eq(trips.createdBy, viewer.userId)),
    viewer.personId
      ? db
          .select({ id: tripPeople.tripId })
          .from(tripPeople)
          .where(eq(tripPeople.personId, viewer.personId))
      : Promise.resolve([] as { id: string }[]),
  ]);
  return new Set([...created, ...tagged].map((r) => r.id));
}

// The trip when the viewer may see it, otherwise null. Callers treat null as
// "not found" so an invisible trip is indistinguishable from a missing one.
export async function findVisibleTrip(viewer: Viewer, tripId: string): Promise<TripRow | null> {
  const db = getDb();
  const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
  if (!trip) return null;
  if (isSuperAdmin(viewer)) return trip;
  const links = await db
    .select({ personId: tripPeople.personId })
    .from(tripPeople)
    .where(eq(tripPeople.tripId, tripId));
  return canSeeTrip(viewer, { createdBy: trip.createdBy, personIds: links.map((l) => l.personId) })
    ? trip
    : null;
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
  const links = await db
    .select({ personId: tripPeople.personId })
    .from(tripPeople)
    .where(eq(tripPeople.tripId, tripId));
  const personIds = new Set(links.map((l) => l.personId));

  const memberRows = await db.select().from(members);
  const emails = new Set<string>(superAdminEmails(process.env));
  for (const m of memberRows) {
    if (m.role === "super_admin" || personIds.has(m.personId)) emails.add(m.email);
  }

  const ids = new Set<string>();
  if (trip.createdBy) ids.add(trip.createdBy);
  if (emails.size > 0) {
    // user.email is stored as typed at sign-up; members emails are lowercase.
    const users = await db.select({ id: userTable.id, email: userTable.email }).from(userTable);
    for (const u of users) if (emails.has(u.email.toLowerCase())) ids.add(u.id);
  }
  return Array.from(ids);
}
