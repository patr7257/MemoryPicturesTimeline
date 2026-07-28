import { requireSession } from "@/lib/session";
import { getTimelineData } from "@/lib/queries";
import { Header } from "@/components/site/Header";
import { PersonFilter } from "@/components/timeline/PersonFilter";
import { TripsMap, type MapTrip } from "@/components/map/TripsMap";

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string }>;
}) {
  await requireSession();
  const { person } = await searchParams;
  const { years, allPeople } = await getTimelineData(person);

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
      <Header />
      <PersonFilter people={allPeople} activeId={person} basePath="/map" />
      <div className="px-6">
        <TripsMap trips={mapTrips} />
        {mapTrips.length === 0 && (
          <p className="font-hand pt-6 text-center text-2xl text-muted-foreground">
            No pins yet: trips get one from their first GPS photo or the edit page.
          </p>
        )}
      </div>
    </main>
  );
}
