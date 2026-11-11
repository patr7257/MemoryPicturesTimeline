import Link from "next/link";
import { Camera, Plane, Play } from "lucide-react";

import { getViewer } from "@/lib/access";
import { getTimelineData } from "@/lib/queries";
import { PersonFilter } from "@/components/timeline/PersonFilter";
import { Timeline } from "@/components/timeline/Timeline";
import { Button } from "@/components/ui/button";

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string }>;
}) {
  const viewer = await getViewer();
  const { person } = await searchParams;
  const { years, allPeople, totalTrips } = await getTimelineData(viewer, person);

  return (
    <main>
      <header className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-x-4 gap-y-3 px-4 pt-6 sm:px-6">
        <div>
          <h1 className="font-hand text-4xl leading-none sm:text-5xl">Timeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalTrips === 0
              ? "Your family's memories, year by year."
              : `${totalTrips} ${totalTrips === 1 ? "vacation" : "vacations"}, newest first.`}
          </p>
        </div>
        {totalTrips > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/vacations" />}
              className="h-11 px-4 md:h-8 md:px-2.5"
            >
              <Plane />
              All vacations
            </Button>
            <Button
              nativeButton={false}
              render={
                <Link
                  href={person ? { pathname: "/slideshow", query: { person } } : "/slideshow"}
                />
              }
              className="h-11 px-4 md:h-8 md:px-2.5"
            >
              <Play />
              Play slideshow
            </Button>
          </div>
        )}
      </header>

      <PersonFilter people={allPeople} activeId={person} basePath="/timeline" />

      {totalTrips === 0 ? (
        <section className="mx-auto max-w-md px-6 py-20 text-center">
          <Camera className="mx-auto size-10 text-muted-foreground" />
          <p className="font-hand mt-4 text-3xl">
            {person ? "No vacations with this person yet." : "Memory lane is still empty."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {person
              ? "Pick Everyone to see all your vacations, or browse the full list."
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
      ) : (
        <Timeline years={years} />
      )}
    </main>
  );
}
