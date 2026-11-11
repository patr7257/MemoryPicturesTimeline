// Read side for comments. Like queries.ts, every read takes the Viewer and
// returns only comments on trips that viewer may see.
import "server-only";

import { asc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { user } from "@/db/auth-schema";
import { comments } from "@/db/schema";
import { findVisibleTrip, visibleTripIds } from "@/lib/access";
import { canDeleteComment, type Viewer } from "@/lib/access-policy";

export type CommentView = {
  id: string;
  tripId: string;
  // Null for a comment on the trip itself.
  photoId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: Date;
  // The viewer may delete it (author or super admin).
  canDelete: boolean;
};

async function load(viewer: Viewer, tripIds: string[]): Promise<CommentView[]> {
  if (tripIds.length === 0) return [];
  const rows = await getDb()
    .select({
      id: comments.id,
      tripId: comments.tripId,
      photoId: comments.photoId,
      authorId: comments.authorId,
      authorName: user.name,
      body: comments.body,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(user, eq(user.id, comments.authorId))
    .where(inArray(comments.tripId, tripIds))
    .orderBy(asc(comments.createdAt));
  return rows.map((r) => ({ ...r, canDelete: canDeleteComment(viewer, r) }));
}

// Every comment of one trip (trip-level and photo-level), oldest first.
// Empty when the viewer may not see the trip.
export async function getTripComments(viewer: Viewer, tripId: string): Promise<CommentView[]> {
  const trip = await findVisibleTrip(viewer, tripId);
  return trip ? load(viewer, [trip.id]) : [];
}

// Comments across several trips (slideshow over many trips). Ids the viewer
// may not see are dropped silently.
export async function getCommentsForTrips(
  viewer: Viewer,
  tripIds: string[],
): Promise<CommentView[]> {
  const visible = await visibleTripIds(viewer);
  return load(viewer, visible === "all" ? tripIds : tripIds.filter((id) => visible.has(id)));
}
