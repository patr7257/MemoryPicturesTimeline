import { Suspense } from "react";

import { getViewer } from "@/lib/access";
import { getViewerFamilies, getVisiblePeople } from "@/lib/family-queries";
import { type FilterParams, parseFilterParams, resolveFilter } from "@/lib/person-filter";
import { getTimelineData } from "@/lib/queries";
import type { VacationListItem } from "@/lib/vacations-view";
import { VacationsOverview } from "@/components/vacations/VacationsOverview";

export default async function VacationsPage({
  searchParams,
}: {
  searchParams: Promise<FilterParams>;
}) {
  const viewer = await getViewer();
  const { selection } = parseFilterParams(await searchParams);
  const [{ years }, people, families] = await Promise.all([
    getTimelineData(viewer),
    getVisiblePeople(viewer),
    getViewerFamilies(viewer),
  ]);
  // The overview filters the full visible list in the browser by `effective`.
  const resolved = resolveFilter({ selection, families, people });

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
        <VacationsOverview
          vacations={vacations}
          people={people}
          viewerPersonId={viewer.personId}
          filter={{ resolved, families }}
        />
      </Suspense>
    </main>
  );
}
