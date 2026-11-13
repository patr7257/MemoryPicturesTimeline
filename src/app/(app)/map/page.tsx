import { getViewer } from "@/lib/access";
import { getTimelineData } from "@/lib/queries";
import { parsePersonParam, type PersonParam } from "@/lib/person-filter";
import { PersonFilter } from "@/components/timeline/PersonFilter";
import { TripsMap, type MapTrip } from "@/components/map/TripsMap";

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: PersonParam }>;
}) {
  const viewer = await getViewer();
  const personIds = parsePersonParam((await searchParams).person);
  const { years, allPeople } = await getTimelineData(viewer, personIds);

  const mapTrips: MapTrip[] = years
    .flatMap((y) => y.trips)
    .filter((t) => t.lat !== null && t.lng !== null)
    .map((t) => ({
      id: t.id,
      title: t.title,
      startDate: t.startDate,
      endDate: t.endDate,
      locationName: t.locationName,
      lat: t.lat!,
      lng: t.lng!,
      coverPhotoId: t.coverPhotoId,
      photoCount: t.photoCount,
    }));

  return (
    <main className="pb-12">
      <PersonFilter people={allPeople} activeIds={personIds} basePath="/map" />
      <div className="px-6">
        <TripsMap trips={mapTrips} />
        {mapTrips.length === 0 && (
          <p className="font-hand pt-6 text-center text-2xl text-muted-foreground">
            {personIds.length > 0
              ? "No pins for these people yet."
              : "No pins yet: a vacation gets one from its cover photo's location."}
          </p>
        )}
      </div>
    </main>
  );
}
