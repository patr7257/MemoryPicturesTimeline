// Lookups for the share dialog and the tag picker. Decisions are pure
// functions in share-rules.ts and access-policy.ts; this file loads facts.
import "server-only";

import { eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { people, tripPeople, tripShares } from "@/db/schema";
import { canShareTrip, isUuid, type Viewer } from "@/lib/access-policy";
import { getPersonFacts, getVisiblePeople, type PersonChoice } from "@/lib/family-queries";
import { mergeByName, shareTargetsFrom } from "@/lib/share-rules";

export type TripSharing = { canShare: boolean; targets: PersonChoice[]; sharedIds: string[] };

// Who the viewer may share this vacation with, and which of them it is shared
// with now. Shares outside those targets (made by another family) are never
// listed, counted or hinted at. The caller has already checked visibility.
export async function getTripSharing(
  viewer: Viewer,
  trip: { id: string; createdBy: string | null },
): Promise<TripSharing> {
  const db = getDb();
  const tagged = await db
    .select({ personId: tripPeople.personId })
    .from(tripPeople)
    .where(eq(tripPeople.tripId, trip.id));
  const canShare = canShareTrip(viewer, { createdBy: trip.createdBy, personIds: tagged.map((t) => t.personId) });
  if (!canShare) return { canShare: false, targets: [], sharedIds: [] };

  const visible = await getVisiblePeople(viewer);
  const facts = await getPersonFacts(visible.map((p) => p.id));
  const targets = shareTargetsFrom(viewer, visible, facts);
  if (targets.length === 0) return { canShare: true, targets: [], sharedIds: [] };

  const shares = await db
    .select({ personId: tripShares.personId })
    .from(tripShares)
    .where(eq(tripShares.tripId, trip.id));
  const targetIds = new Set(targets.map((t) => t.id));
  return { canShare: true, targets, sharedIds: shares.map((s) => s.personId).filter((id) => targetIds.has(id)) };
}

// The people the viewer may tag: those they see plus those already tagged on
// the vacation (who stay as they are), by name.
export async function getTagTargets(viewer: Viewer, taggedIds: readonly string[]): Promise<PersonChoice[]> {
  const visible = await getVisiblePeople(viewer);
  const seen = new Set(visible.map((p) => p.id));
  const missing = Array.from(new Set(taggedIds.filter((id) => isUuid(id) && !seen.has(id))));
  if (missing.length === 0) return visible;
  const extra = await getDb()
    .select({ id: people.id, name: people.name })
    .from(people)
    .where(inArray(people.id, missing));
  // Only the name of someone outside the viewer families is theirs to see.
  return mergeByName(visible, extra.map((p) => ({ ...p, color: null })));
}
