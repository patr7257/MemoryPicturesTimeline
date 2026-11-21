import type { Metadata } from "next";

import { PeopleFilter } from "@/components/filter/PeopleFilter";
import { SlideshowLauncher } from "@/components/slideshow/SlideshowLauncher";
import { getViewer } from "@/lib/access";
import { getViewerFamilies, getVisiblePeople } from "@/lib/family-queries";
import { type FilterParams, parseFilterParams, resolveFilter } from "@/lib/person-filter";
import { selectionTitle } from "@/lib/slideshow";
import { getSlideshowPhotos } from "@/lib/slideshow-queries";

export const metadata: Metadata = { title: "Slideshow" };
export const dynamic = "force-dynamic";

// /slideshow?family=<id>&person=<id>: photos of the vacations ANY effective
// person is on. No filter on means every vacation the viewer may see. Ids the
// viewer cannot see are dropped by resolveFilter, as if absent.
export default async function SlideshowPage({
  searchParams,
}: {
  searchParams: Promise<FilterParams>;
}) {
  const viewer = await getViewer();
  const { selection } = parseFilterParams(await searchParams);
  const [families, people] = await Promise.all([getViewerFamilies(viewer), getVisiblePeople(viewer)]);
  const resolved = resolveFilter({ selection, families, people });
  const effective = resolved.effective;

  const photos =
    (await getSlideshowPhotos(viewer, { personIds: effective ?? undefined })) ?? [];
  const names = effective
    ? people.filter((p) => effective.includes(p.id)).map((p) => p.name)
    : [];

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="font-hand text-4xl">Slideshow: {selectionTitle(names)}</h1>

      <div className="[&>nav]:max-w-none [&>nav]:px-0 [&>nav]:py-0">
        <PeopleFilter pathname="/slideshow" resolved={resolved} families={families} />
      </div>

      <SlideshowLauncher key={effective?.join(",") ?? "all"} photos={photos} />
    </main>
  );
}
