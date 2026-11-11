import { Suspense } from "react";

import { getViewer } from "@/lib/access";
import { getAllPeople, getTimelineData } from "@/lib/queries";
import type { VacationListItem } from "@/lib/vacations-view";
import { VacationsOverview } from "@/components/vacations/VacationsOverview";

export default async function VacationsPage() {
  const viewer = await getViewer();
  const [{ years }, people] = await Promise.all([getTimelineData(viewer), getAllPeople()]);

  // Flat list for the client; only what the cards and rows draw crosses over.
  const vacations: VacationListItem[] = years.flatMap((y) =>
    y.trips.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      startDate: t.startDate,
      endDate: t.endDate,
      locationName: t.locationName,
      people: t.people,
      photoCount: t.photoCount,
      coverPhotoId: t.coverPhotoId,
      coverBlurhash:
        t.previewPhotos.find((p) => p.id === t.coverPhotoId)?.blurhash ?? null,
      canManage: t.canManage,
    })),
  );

  return (
    <main>
      <Suspense>
        <VacationsOverview vacations={vacations} people={people} viewerPersonId={viewer.personId} />
      </Suspense>
    </main>
  );
}
