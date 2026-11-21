import Link from "next/link";
import { Camera } from "lucide-react";

import { getViewer } from "@/lib/access";
import { getViewerFamilies, getVisiblePeople } from "@/lib/family-queries";
import { getTimelineData } from "@/lib/queries";
import {
  filterQuery,
  type FilterParams,
  parseFilterParams,
  resolveFilter,
} from "@/lib/person-filter";
import { FlightProvider } from "@/components/globe/FlightProvider";
import { PeopleFilter } from "@/components/filter/PeopleFilter";
import { TimelineHeader } from "@/components/timeline/TimelineHeader";
import { TimelineView } from "@/components/timeline/TimelineView";
import { Button } from "@/components/ui/button";

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<FilterParams & { q?: string | string[] }>;
}) {
  const viewer = await getViewer();
  const params = await searchParams;
  const { selection } = parseFilterParams(params);
  // The search text rides along on the filter chips, as in TimelineView.
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? "";
  const [families, people] = await Promise.all([getViewerFamilies(viewer), getVisiblePeople(viewer)]);
  const resolved = resolveFilter({ selection, families, people });
  const filtered = resolved.effective !== null;
  const { years, totalTrips } = await getTimelineData(viewer, resolved.effective);

  // With vacations, the client view owns the header (its search changes the
  // count line), the filter, the globe and the timeline.
  if (totalTrips > 0) {
    return (
      <FlightProvider>
        <main>
          <TimelineView
            years={years}
            totalTrips={totalTrips}
            resolved={resolved}
            families={families}
            slideshowQuery={filterQuery(resolved.selection)}
          />
        </main>
      </FlightProvider>
    );
  }

  return (
    <FlightProvider>
      <main>
        <TimelineHeader subtitle="Your family's memories, year by year." />

        <PeopleFilter
          pathname="/timeline"
          resolved={resolved}
          families={families}
          keep={q ? { q } : undefined}
        />

        <section className="mx-auto max-w-md px-6 py-20 text-center">
          <Camera className="mx-auto size-10 text-muted-foreground" />
          <p className="font-hand mt-4 text-3xl">
            {filtered ? "No vacations with these people yet." : "Memory lane is still empty."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {filtered
              ? "Turn the filters off to see all your vacations, or browse the full list."
              : "Add the first vacation photos and the timeline starts here. Vacations other people tag you in show up here too."}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button size="lg" className="h-11 md:h-9" nativeButton={false} render={<Link href="/upload" />}>
              Add the first photos
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 md:h-9"
              nativeButton={false}
              render={<Link href="/vacations" />}
            >
              Open the vacations overview
            </Button>
          </div>
        </section>
      </main>
    </FlightProvider>
  );
}
