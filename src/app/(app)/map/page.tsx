import { getViewer } from "@/lib/access";
import { getAllPeople, getMapPhotos } from "@/lib/queries";
import { parsePersonParam, type PersonParam } from "@/lib/person-filter";
import { PersonFilter } from "@/components/timeline/PersonFilter";
import { PhotosMap } from "@/components/map/PhotosMap";

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: PersonParam }>;
}) {
  const viewer = await getViewer();
  const personIds = parsePersonParam((await searchParams).person);
  const [photos, allPeople] = await Promise.all([getMapPhotos(viewer, personIds), getAllPeople()]);

  return (
    <main className="pb-12">
      <PersonFilter people={allPeople} activeIds={personIds} basePath="/map" />
      <div className="px-6">
        <PhotosMap photos={photos} />
        {photos.length === 0 && (
          <p className="font-hand pt-6 text-center text-2xl text-muted-foreground">
            {personIds.length > 0
              ? "No photos with a location for these people yet."
              : "No photos with a location yet."}
          </p>
        )}
      </div>
    </main>
  );
}
