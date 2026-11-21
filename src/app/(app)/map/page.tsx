import { getViewer } from "@/lib/access";
import { getViewerFamilies, getVisiblePeople } from "@/lib/family-queries";
import { getMapPhotos } from "@/lib/queries";
import { type FilterParams, parseFilterParams, resolveFilter } from "@/lib/person-filter";
import { PeopleFilter } from "@/components/filter/PeopleFilter";
import { PhotosMap } from "@/components/map/PhotosMap";

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<FilterParams>;
}) {
  const viewer = await getViewer();
  const { selection } = parseFilterParams(await searchParams);
  const [families, people] = await Promise.all([getViewerFamilies(viewer), getVisiblePeople(viewer)]);
  const resolved = resolveFilter({ selection, families, people });
  const photos = await getMapPhotos(viewer, resolved.effective ?? []);

  return (
    <main className="pb-12">
      <PeopleFilter pathname="/map" resolved={resolved} families={families} />
      <div className="px-6">
        <PhotosMap photos={photos} />
        {photos.length === 0 && (
          <p className="font-hand pt-6 text-center text-2xl text-muted-foreground">
            {resolved.effective !== null
              ? "No photos with a location for these people yet."
              : "No photos with a location yet."}
          </p>
        )}
      </div>
    </main>
  );
}
